// Completing mirror rows from chain views after events marked them, through the indexing loop.

import { custodians, issuerReliability, reserveStatus } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type {
  ChainCustodian,
  ChainIssuerReliability,
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
  failing = false;
  reads: string[] = [];

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
    expect(result).toEqual({ custodians: 1, issuers: 1, reserveStatuses: 1 });

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
    expect(result).toEqual({ custodians: 0, issuers: 0, reserveStatuses: 0 });
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
    expect(result).toEqual({ custodians: 0, issuers: 1, reserveStatuses: 1 });
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
