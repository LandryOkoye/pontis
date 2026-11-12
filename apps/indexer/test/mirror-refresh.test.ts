// Completing mirror rows from chain views after events marked them, through the indexing loop.

import { custodians, issuerReliability, mintRequests, reserveStatus } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type {
  ChainCustodian,
  ChainIssuerReliability,
  ChainMintRequest,
  ChainReserveStatus,
  MirrorChain,
} from "../src/chain-views.ts";
import { indexOnce } from "../src/indexer.ts";
import { refreshMirrors } from "../src/mirror/refresh.ts";
import { FakeSource, noVerifier, silent } from "./fake-source.ts";
import { execution, useSeededDb } from "./harness.ts";
import * as fx from "./mirror-fixtures.ts";
import { reserveStatusFixture } from "./reconcile-helpers.ts";

const h = useSeededDb();
const NOW = new Date("2026-11-11T13:00:00Z");

class FakeMirrorChain implements MirrorChain {
  custodianRecords = new Map<string, ChainCustodian>();
  reliability = new Map<string, ChainIssuerReliability>();
  statuses = new Map<string, ChainReserveStatus>();
  mints = new Map<number, ChainMintRequest>();
  failing = false;
  reads: string[] = [];

  async mintRequest(id: number) {
    this.reads.push(`mint:${id}`);
    if (this.failing) throw new Error("rpc down");
    return this.mints.get(id) ?? null;
  }

  async custodian(id: string) {
    this.reads.push(`custodian:${id}`);
    if (this.failing) throw new Error("rpc down");
    return this.custodianRecords.get(id) ?? null;
  }
  async reserveStatus(id: string) {
    this.reads.push(`status:${id}`);
    if (this.failing) throw new Error("rpc down");
    const s = this.statuses.get(id);
    if (!s) throw new Error("no status");
    return s;
  }
  async issuerReliability(id: string) {
    this.reads.push(`issuer:${id}`);
    if (this.failing) throw new Error("rpc down");
    const r = this.reliability.get(id);
    if (!r) throw new Error("no record");
    return r;
  }
}

const custodianRecord: ChainCustodian = {
  id: "vault-co-sim",
  name: "Meridian Vault Co (SYNTHETIC)",
  jurisdiction: "CH",
  attester_key: "ed25519:custodian-key",
  status: "active",
  synthetic: true,
  verification_status: "unverified",
  evidence: [],
  registered_by: "reg.testnet",
  registered_at_ms: fx.T0,
};

const reliabilityRecord: ChainIssuerReliability = {
  issuer_id: "meridian-sim",
  requested: 4,
  accepted: 3,
  fulfilled: 2,
  rejected: 1,
  expired: 1,
  accept_misses: 1,
  fulfil_misses: 0,
  reclaimed: 1,
  accept_latency_ms_total: "90000",
  settle_latency_ms_total: "240000",
  last_miss_ms: fx.T0 + 5,
  simulated: true,
};

describe("mirror refresh", () => {
  it("reads custodian details, issuer counters and the reserve status for rows an event marked", async () => {
    await h.apply(
      execution([fx.custodianRegistered(), fx.redemptionRequested(), fx.reserveStatusChanged()]),
    );
    const chain = new FakeMirrorChain();
    chain.custodianRecords.set("vault-co-sim", custodianRecord);
    chain.reliability.set("meridian-sim", reliabilityRecord);
    chain.statuses.set("a", reserveStatusFixture({ sources: ["simulated_custodian"] }));

    const result = await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    expect(result).toEqual({ custodians: 1, issuers: 1, reserveStatuses: 1, mintRequests: 0 });

    const [c] = await h.db.select().from(custodians);
    expect(c).toMatchObject({
      name: "Meridian Vault Co (SYNTHETIC)",
      jurisdiction: "CH",
      synthetic: true,
      verificationStatus: "unverified",
      needsRefresh: false,
    });
    const [i] = await h.db.select().from(issuerReliability);
    expect(i).toMatchObject({
      requested: 4,
      fulfilled: 2,
      acceptMisses: 1,
      acceptLatencyMsTotal: "90000",
      simulated: true,
      needsRefresh: false,
    });
    expect(i?.lastMissAt?.getTime()).toBe(fx.T0 + 5);
    const [s] = await h.db.select().from(reserveStatus);
    expect(s).toMatchObject({
      state: "ok",
      simulated: true,
      sources: ["simulated_custodian"],
      chainRefreshedAt: NOW,
    });
    expect(s?.chainStatus?.state).toBe("ok");
  });

  it("reads nothing for rows that are current", async () => {
    const chain = new FakeMirrorChain();
    const result = await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    expect(result).toEqual({ custodians: 0, issuers: 0, reserveStatuses: 0, mintRequests: 0 });
    expect(chain.reads).toEqual([]);
  });

  it("reads the status again after the next status change, and the issuer after the next redemption event", async () => {
    await h.apply(
      execution([
        fx.reserveStatusChanged({
          from_state: "ok",
          to_state: "breached",
          timestamp_ms: NOW.getTime() + 1_000,
        }),
        fx.redemptionAccepted(),
      ]),
    );
    const chain = new FakeMirrorChain();
    chain.statuses.set("a", reserveStatusFixture({ state: "breached" }));
    chain.reliability.set("meridian-sim", { ...reliabilityRecord, accepted: 4 });
    const result = await refreshMirrors({
      db: h.db,
      chain,
      log: silent,
      now: () => new Date(NOW.getTime() + 60_000),
    });
    expect(result).toEqual({ custodians: 0, issuers: 1, reserveStatuses: 1, mintRequests: 0 });
    expect((await h.db.select().from(issuerReliability))[0]?.accepted).toBe(4);
  });

  it("leaves rows marked, and logs, when the chain cannot be read", async () => {
    await h.apply(execution([fx.custodianRegistered({ id: "late-co" })]));
    const chain = new FakeMirrorChain();
    chain.failing = true;
    const log = { ...silent, errors: [] as string[] };
    const result = await refreshMirrors({ db: h.db, chain, log, now: () => NOW });
    expect(result.custodians).toBe(0);
    expect(log.errors).toContain("custodian refresh failed; will retry");
    const [c] = await h.db.select().from(custodians).where(eq(custodians.id, "late-co"));
    expect(c?.needsRefresh).toBe(true);
  });

  it("stops retrying a custodian the chain does not have, keeping what its events gave", async () => {
    const chain = new FakeMirrorChain();
    await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    const [c] = await h.db.select().from(custodians).where(eq(custodians.id, "late-co"));
    expect(c).toMatchObject({
      needsRefresh: false,
      name: null,
      attesterKey: "ed25519:custodian-key",
    });
  });
});

const mintOnChain = (over: Partial<ChainMintRequest> = {}): ChainMintRequest => ({
  id: 1,
  representation_id: "a",
  recipient: "alice.testnet",
  amount: "5000000",
  reference: "sub-0001",
  status: "requested",
  requested_by: "issuer-bo.testnet",
  requested_ms: fx.T0 + 10_000,
  resolved_ms: null,
  failure: null,
  ...over,
});
const mintRow = async (id: number) =>
  (await h.db.select().from(mintRequests).where(eq(mintRequests.id, id)))[0];

describe("mint requests", () => {
  it("sees `minting`, which execute_mint emits no event for, then the terminal state", async () => {
    await h.apply(execution([fx.mintRequested({ id: 1 })]));
    const chain = new FakeMirrorChain();
    chain.mints.set(1, mintOnChain({ status: "minting" }));
    const first = await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    expect(first.mintRequests).toBe(1);
    expect(await mintRow(1)).toMatchObject({ status: "minting", resolvedAt: null });

    chain.mints.set(1, mintOnChain({ status: "minted", resolved_ms: fx.T0 + 20_000 }));
    await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    const done = await mintRow(1);
    expect(done).toMatchObject({ status: "minted", failure: null });
    expect(done?.resolvedAt?.getTime()).toBe(fx.T0 + 20_000);
  });

  it("closes a request from the chain when the completion event was missed, with the failure reason", async () => {
    await h.apply(execution([fx.mintRequested({ id: 2 })]));
    const chain = new FakeMirrorChain();
    chain.mints.set(
      2,
      mintOnChain({
        id: 2,
        status: "failed",
        resolved_ms: fx.T0 + 30_000,
        failure: "token mint failed",
      }),
    );
    await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    expect(await mintRow(2)).toMatchObject({ status: "failed", failure: "token mint failed" });
  });

  it("does not touch a request whose status already matches, and never rereads a finished one", async () => {
    await h.apply(execution([fx.mintRequested({ id: 3 })]));
    const chain = new FakeMirrorChain();
    chain.mints.set(3, mintOnChain({ id: 3 }));
    expect(
      (await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW })).mintRequests,
    ).toBe(0);
    chain.mints.set(3, mintOnChain({ id: 3, status: "cancelled", resolved_ms: fx.T0 + 40_000 }));
    await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    chain.reads = [];
    await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    expect(chain.reads.filter((r) => r === "mint:3")).toEqual([]);
  });

  it("keeps the row and logs when the chain cannot be read", async () => {
    await h.apply(execution([fx.mintRequested({ id: 4 })]));
    const chain = new FakeMirrorChain();
    chain.failing = true;
    const log = { ...silent, errors: [] as string[] };
    await refreshMirrors({ db: h.db, chain, log, now: () => NOW });
    expect(log.errors).toContain("mint request refresh failed; will retry");
    expect((await mintRow(4))?.status).toBe("requested");
  });

  it("is applied by the same event later: a mint_completed after the refresh changes nothing", async () => {
    await h.apply(execution([fx.mintRequested({ id: 5 })]));
    const chain = new FakeMirrorChain();
    chain.mints.set(5, mintOnChain({ id: 5, status: "minted", resolved_ms: fx.T0 + 50_000 }));
    await refreshMirrors({ db: h.db, chain, log: silent, now: () => NOW });
    await h.apply(
      execution([
        [
          "mint_completed",
          {
            id: 5,
            representation_id: "a",
            recipient: "alice.testnet",
            amount: "5000000",
            circulating_units: "5000000",
            headroom_units: "0",
            timestamp_ms: fx.T0 + 50_000,
          },
        ],
      ]),
    );
    const row = await mintRow(5);
    expect(row?.status).toBe("minted");
    expect(row?.resolvedAt?.getTime()).toBe(fx.T0 + 50_000);
  });
});

describe("indexOnce with a mirror chain", () => {
  it("applies the block, then completes the rows it marked", async () => {
    const source = new FakeSource(205);
    source.put(200, execution([fx.custodianRegistered({ id: "loop-co" })]));
    const chain = new FakeMirrorChain();
    chain.custodianRecords.set("loop-co", { ...custodianRecord, id: "loop-co" });
    const pass = await indexOnce({
      db: h.db,
      source,
      verifier: noVerifier,
      coreId: "core.testnet",
      log: silent,
      confirmations: 0,
      startHeight: 200,
      mirror: chain,
    });
    expect([pass.stored, pass.refreshed]).toEqual([1, 1]);
    const [c] = await h.db.select().from(custodians).where(eq(custodians.id, "loop-co"));
    expect(c?.name).toBe("Meridian Vault Co (SYNTHETIC)");
  });
});
