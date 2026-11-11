// Custody, reserve, policy, mint and signer-key events applied to the mirror tables.

import {
  auditLog,
  custodians,
  custodyLinks,
  mintRequests,
  reserveAttestations,
  reservePolicies,
  reserveStatus,
  reserveSupplyReads,
  settlementEvents,
  signerKeys,
} from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { execution } from "./harness.ts";
import { useSeededDb } from "./harness.ts";
import * as fx from "./mirror-fixtures.ts";

const h = useSeededDb();

describe("custodians and custody links", () => {
  it("registers a custodian with the details the event carries and marks it for a refresh", async () => {
    await h.apply(execution([fx.custodianRegistered()]));
    const [row] = await h.db.select().from(custodians).where(eq(custodians.id, "vault-co-sim"));
    expect(row).toMatchObject({
      status: "active",
      attesterKey: "ed25519:custodian-key",
      registeredBy: "reg.testnet",
      name: null,
      synthetic: null,
      needsRefresh: true,
    });
    expect(row?.registeredAt.getTime()).toBe(fx.T0);
  });

  it("follows status changes and key rotation", async () => {
    await h.apply(execution([fx.custodianStatusChanged(), fx.custodianKeySet()]));
    const [row] = await h.db.select().from(custodians).where(eq(custodians.id, "vault-co-sim"));
    expect(row).toMatchObject({ status: "suspended", attesterKey: "ed25519:rotated-key" });
    await h.apply(execution([fx.custodianStatusChanged({ from: "suspended", to: "retired" })]));
    const [after] = await h.db.select().from(custodians).where(eq(custodians.id, "vault-co-sim"));
    expect(after?.status).toBe("retired");
  });

  it("creates a placeholder when the registering event predates the indexer", async () => {
    await h.apply(execution([fx.custodianStatusChanged({ id: "early-co", to: "suspended" })]));
    const [row] = await h.db.select().from(custodians).where(eq(custodians.id, "early-co"));
    expect(row).toMatchObject({ status: "suspended", needsRefresh: true, name: null });
  });

  it("replaces a custody link wholesale", async () => {
    await h.apply(execution([fx.custodyLinked()]));
    await h.apply(
      execution([fx.custodyLinked({ structure: "omnibus", custodian_ids: ["vault-co-sim", "b"] })]),
    );
    const rows = await h.db.select().from(custodyLinks);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      representationId: "a",
      structure: "omnibus",
      custodianIds: ["vault-co-sim", "b"],
    });
  });
});

describe("reserves", () => {
  it("stores every attestation with its labels, and keeps the whole history", async () => {
    await h.apply(
      execution([
        fx.reserveAttested(),
        fx.reserveAttested({ seq: 1, reserved_units: "2000", as_of_ms: fx.T0 + 9_000 }),
      ]),
    );
    const rows = await h.db.select().from(reserveAttestations).orderBy(reserveAttestations.seq);
    expect(rows.map((r) => [r.seq, r.reservedUnits, r.simulated, r.source])).toEqual([
      [0, "1000000000000", true, "simulated_custodian"],
      [1, "2000", true, "simulated_custodian"],
    ]);
    expect(rows[0]).toMatchObject({
      custodianId: "vault-co-sim",
      reportHash: fx.HASH_A,
      reportUri: "sim://reserves/a/2026-11",
      attesterKey: "ed25519:custodian-key",
    });
    expect(rows[0]?.asOf.getTime()).toBe(fx.T0 + 4_000);
  });

  it("keeps the signer's own simulated flag rather than assuming one", async () => {
    await h.apply(execution([fx.reserveAttested({ seq: 2, simulated: false, source: "x" })]));
    const [row] = await h.db
      .select()
      .from(reserveAttestations)
      .where(eq(reserveAttestations.seq, 2));
    expect([row?.simulated, row?.source]).toEqual([false, "x"]);
  });

  it("sets the policy that makes a representation monitored, and replaces it", async () => {
    await h.apply(execution([fx.reservePolicySet()]));
    await h.apply(
      execution([
        fx.reservePolicySet({
          policy: {
            tolerance_bps: 50,
            max_reserve_age_ms: 120_000,
            action: "pause_mint",
            baseline_supply: "7",
          },
        }),
      ]),
    );
    const rows = await h.db.select().from(reservePolicies);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      toleranceBps: 50,
      maxReserveAgeMs: 120_000,
      action: "pause_mint",
      baselineSupply: "7",
      setBy: "owner.testnet",
    });
  });

  it("records supply reads", async () => {
    await h.apply(execution([fx.reserveSupplyRead()]));
    const [row] = await h.db.select().from(reserveSupplyReads);
    expect(row).toMatchObject({
      representationId: "a",
      supply: "900000000000",
      simulated: true,
      source: "chain_view",
    });
  });

  it("keeps the latest status change and defaults the labels to simulated", async () => {
    await h.apply(execution([fx.reserveStatusChanged()]));
    await h.apply(
      execution([
        fx.reserveStatusChanged({
          from_state: "ok",
          to_state: "breached",
          circulating_units: "1100000000000",
          ratio_bps: 9_090,
          timestamp_ms: fx.T0 + 20_000,
        }),
      ]),
    );
    const rows = await h.db.select().from(reserveStatus);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: "breached",
      action: "restrict_conversions",
      attestedUnits: "1000000000000",
      circulatingUnits: "1100000000000",
      ratioBps: 9_090,
      simulated: true,
      chainStatus: null,
    });
  });
});

describe("signer keys", () => {
  it("adds a key with its scopes and marks it removed without deleting it", async () => {
    await h.apply(execution([fx.signerKeyAdded()]));
    const key = () =>
      h.db.select().from(signerKeys).where(eq(signerKeys.publicKey, "ed25519:custodian-key"));
    expect((await key())[0]).toMatchObject({
      role: "reserve_attester",
      accountId: "att.testnet",
      scopes: ["reserves"],
      removedAt: null,
    });
    await h.apply(execution([fx.signerKeyRemoved()]));
    const [removed] = await key();
    expect(removed?.removedBy).toBe("owner.testnet");
    expect(removed?.removedAt?.getTime()).toBe(fx.T0 + 9_000);
  });

  it("makes a re-added key active again", async () => {
    await h.apply(
      execution([
        fx.signerKeyAdded({ scopes: ["reserves", "custody"], timestamp_ms: fx.T0 + 50_000 }),
      ]),
    );
    const [row] = await h.db
      .select()
      .from(signerKeys)
      .where(eq(signerKeys.publicKey, "ed25519:custodian-key"));
    expect(row).toMatchObject({
      scopes: ["reserves", "custody"],
      removedAt: null,
      removedBy: null,
    });
  });

  it("lets one key serve another role as its own row", async () => {
    await h.apply(execution([fx.signerKeyAdded({ role: "bridge_attester", scopes: ["bridge"] })]));
    expect(await h.db.select().from(signerKeys)).toHaveLength(2);
  });
});

describe("mint requests", () => {
  const mint = () => h.db.select().from(mintRequests).orderBy(mintRequests.id);

  it("follows a request through to a completed mint", async () => {
    await h.apply(execution([fx.mintRequested()]));
    expect((await mint())[0]).toMatchObject({
      id: 1,
      status: "requested",
      amount: "5000000",
      recipient: "alice.testnet",
      reference: "sub-0001",
      requestedBy: "issuer-bo.testnet",
      resolvedAt: null,
    });
    await h.apply(
      execution([
        [
          "mint_completed",
          {
            id: 1,
            representation_id: "a",
            recipient: "alice.testnet",
            amount: "5000000",
            circulating_units: "5000000",
            headroom_units: "0",
            timestamp_ms: fx.T0 + 11_000,
          },
        ],
      ]),
    );
    const [done] = await mint();
    expect(done?.status).toBe("minted");
    expect(done?.resolvedAt?.getTime()).toBe(fx.T0 + 11_000);
  });

  it("records a failed and a cancelled request", async () => {
    await h.apply(
      execution([
        fx.mintRequested({ id: 2 }),
        fx.mintRequested({ id: 3 }),
        [
          "mint_failed",
          { id: 2, representation_id: "a", reason: "token refused", timestamp_ms: fx.T0 + 12_000 },
        ],
        ["mint_cancelled", { id: 3, by: "issuer-bo.testnet", timestamp_ms: fx.T0 + 13_000 }],
      ]),
    );
    const rows = await mint();
    expect(rows.map((r) => [r.id, r.status, r.failure])).toEqual([
      [1, "minted", null],
      [2, "failed", "token refused"],
      [3, "cancelled", null],
    ]);
  });
});

describe("replay and bad payloads", () => {
  it("changes nothing when a block's events arrive again", async () => {
    const run = execution([
      fx.custodianRegistered({ id: "replay-co" }),
      fx.reserveAttested({ custodian_id: "replay-co", seq: 40 }),
      fx.reserveSupplyRead({ timestamp_ms: fx.T0 + 77_000 }),
    ]);
    expect(await h.apply(run)).toMatchObject({ stored: 3, duplicates: 0 });
    // A later change to the custodian must survive the replay of the older block.
    await h.apply(execution([fx.custodianStatusChanged({ id: "replay-co", to: "retired" })]));
    expect(await h.apply(run)).toMatchObject({ stored: 0, duplicates: 3 });
    const [custodian] = await h.db.select().from(custodians).where(eq(custodians.id, "replay-co"));
    expect(custodian?.status).toBe("retired");
    expect(
      await h.db.select().from(reserveAttestations).where(eq(reserveAttestations.seq, 40)),
    ).toHaveLength(1);
    expect(
      await h.db
        .select()
        .from(reserveSupplyReads)
        .where(eq(reserveSupplyReads.readAt, new Date(fx.T0 + 77_000))),
    ).toHaveLength(1);
  });

  it("stores the raw event but skips the mirror and audits a payload it cannot read", async () => {
    const bad = execution([fx.reserveAttested({ seq: 99, reserved_units: 5 })]);
    await h.apply(bad);
    expect(await h.eventsOf(bad.receiptId)).toHaveLength(1);
    expect(
      await h.db.select().from(reserveAttestations).where(eq(reserveAttestations.seq, 99)),
    ).toEqual([]);
    const audit = await h.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "mirror.event_unreadable"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ subject: "reserve_attested", actor: "indexer" });
  });

  it("ignores events of a panicked receipt", async () => {
    const failed = execution([fx.reservePolicySet({ representation_id: "ghost" })], {
      success: false,
    });
    await h.apply(failed);
    expect(
      await h.db
        .select()
        .from(reservePolicies)
        .where(eq(reservePolicies.representationId, "ghost")),
    ).toEqual([]);
    expect(await h.eventsOf(failed.receiptId)).toEqual([]);
    expect((await h.db.select().from(settlementEvents)).length).toBeGreaterThan(0);
  });
});
