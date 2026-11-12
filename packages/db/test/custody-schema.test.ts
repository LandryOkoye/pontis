// The ADR 0020 mirror tables: what the migration creates and the keys that make event replay safe.

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  custodians,
  issuerReliability,
  mintRequests,
  redemptionEvents,
  redemptionTerms,
  redemptions,
  reserveAttestations,
  reservePolicies,
  reserveStatus,
  reserveSupplyReads,
  signerKeys,
} from "../src/index.ts";
import { createTestDb, type TestDb } from "../src/testing.ts";

const AT = new Date("2026-11-11T12:00:00Z");
const U128_MAX = ((1n << 128n) - 1n).toString();
const HASH = "ab".repeat(32);

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});

function attestation(over: Partial<typeof reserveAttestations.$inferInsert> = {}) {
  return {
    receiptId: "r1",
    logIndex: 0,
    blockHeight: 10,
    representationId: "tgold-a",
    custodianId: "vault-co-sim",
    reservedUnits: "1000000000000",
    asOf: AT,
    reportHash: HASH,
    reportUri: "sim://reserves/tgold-a/2026-11",
    simulated: true,
    source: "simulated_custodian",
    attesterKey: "ed25519:key",
    seq: 0,
    submittedAt: AT,
    ...over,
  };
}

describe("mirror tables exist", () => {
  it("creates every table of ADR 0020 section 10", async () => {
    const rows = await t.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = new Set(rows.rows.map((r) => r.table_name));
    for (const name of [
      "custodians",
      "custody_links",
      "reserve_policies",
      "reserve_attestations",
      "reserve_supply_reads",
      "reserve_status",
      "reserve_monitor_report",
      "mint_requests",
      "redemption_terms",
      "redemptions",
      "redemption_events",
      "issuer_reliability",
      "signer_keys",
    ])
      expect(names, name).toContain(name);
  });
});

describe("replay safety", () => {
  it("refuses a second attestation row for the same receipt and log index", async () => {
    await t.db.insert(reserveAttestations).values(attestation());
    await expect(t.db.insert(reserveAttestations).values(attestation())).rejects.toThrow();
    const stored = await t.db
      .insert(reserveAttestations)
      .values(attestation())
      .onConflictDoNothing()
      .returning();
    expect(stored).toEqual([]);
    await t.db.insert(reserveAttestations).values(attestation({ logIndex: 1, seq: 1 }));
  });

  it("does the same for supply reads and redemption events", async () => {
    const read = {
      receiptId: "r2",
      logIndex: 0,
      blockHeight: 11,
      representationId: "tgold-a",
      supply: "5",
      readAt: AT,
    };
    await t.db.insert(reserveSupplyReads).values(read);
    expect(
      await t.db.insert(reserveSupplyReads).values(read).onConflictDoNothing().returning(),
    ).toEqual([]);
    const event = {
      redemptionId: 1,
      kind: "requested",
      at: AT,
      receiptId: "r3",
      logIndex: 0,
      blockHeight: 12,
      data: {},
    } as const;
    await t.db.insert(redemptionEvents).values(event);
    expect(
      await t.db.insert(redemptionEvents).values(event).onConflictDoNothing().returning(),
    ).toEqual([]);
  });

  it("keeps every version of a representation's terms and refuses a repeated version", async () => {
    const terms = {
      representationId: "tgold-a",
      version: 1,
      termsHash: HASH,
      minAmount: "1000000",
      maxAmount: "0",
      feeBps: 25,
      windowAnchorMs: 0,
      windowLengthMs: 0,
      windowPeriodMs: 0,
      acceptWithinMs: 86_400_000,
      settlementDays: 3,
      setBy: "reg.testnet",
      setAt: AT,
      receiptId: "r4",
      logIndex: 0,
    };
    await t.db.insert(redemptionTerms).values(terms);
    await t.db.insert(redemptionTerms).values({ ...terms, version: 2, receiptId: "r5" });
    await expect(
      t.db.insert(redemptionTerms).values({ ...terms, receiptId: "r6" }),
    ).rejects.toThrow();
  });

  it("allows one row per role and key, and the same key under another role", async () => {
    const key: typeof signerKeys.$inferInsert = {
      role: "reserve_attester",
      publicKey: "ed25519:k",
      accountId: "att.testnet",
      scopes: ["reserves"],
      addedBy: "owner.testnet",
      addedAt: AT,
    };
    await t.db.insert(signerKeys).values(key);
    await expect(t.db.insert(signerKeys).values(key)).rejects.toThrow();
    await t.db.insert(signerKeys).values({ ...key, role: "bridge_attester" });
  });
});

describe("amounts and labels", () => {
  it("stores a u128 amount exactly, as a string", async () => {
    await t.db.insert(reservePolicies).values({
      representationId: "tgold-a",
      toleranceBps: 0,
      maxReserveAgeMs: 86_400_000,
      action: "restrict_conversions",
      baselineSupply: U128_MAX,
      setBy: "owner.testnet",
      setAt: AT,
    });
    await t.db.insert(mintRequests).values({
      id: 1,
      representationId: "tgold-a",
      recipient: "alice.testnet",
      amount: U128_MAX,
      reference: "sub-0001",
      status: "requested",
      requestedBy: "issuer-bo.testnet",
      requestedAt: AT,
    });
    const [policy] = await t.db.select().from(reservePolicies);
    const [mint] = await t.db.select().from(mintRequests);
    expect([policy?.baselineSupply, mint?.amount]).toEqual([U128_MAX, U128_MAX]);
  });

  it("labels attestations as the signer said and defaults everything else to simulated", async () => {
    const [row] = await t.db.select().from(reserveAttestations);
    expect([row?.simulated, row?.source]).toEqual([true, "simulated_custodian"]);
    await t.db.insert(reserveStatus).values({
      representationId: "tgold-a",
      state: "ok",
      attestedUnits: "1",
      circulatingUnits: "1",
      changedAt: AT,
    });
    await t.db.insert(issuerReliability).values({ issuerId: "meridian-sim" });
    await t.db.insert(custodians).values({
      id: "vault-co-sim",
      attesterKey: "ed25519:k",
      status: "active",
      registeredBy: "reg.testnet",
      registeredAt: AT,
      updatedAt: AT,
    });
    const [status] = await t.db.select().from(reserveStatus);
    const [reliability] = await t.db.select().from(issuerReliability);
    const [custodian] = await t.db.select().from(custodians);
    expect(status).toMatchObject({ simulated: true, sources: [] });
    expect(reliability).toMatchObject({ simulated: true, needsRefresh: true, requested: 0 });
    // Details the registering event does not carry stay unknown, not guessed.
    expect(custodian).toMatchObject({ name: null, synthetic: null, needsRefresh: true });
  });

  it("stores a redemption with its deadlines and no verified hash", async () => {
    await t.db.insert(redemptions).values({
      id: 1,
      userAccountId: "alice.testnet",
      representationId: "tgold-a",
      issuerId: "meridian-sim",
      amount: "5000000",
      feeBps: 25,
      feeUnits: "12500",
      netUnits: "4987500",
      termsHash: HASH,
      termsVersion: 2,
      payoutInstructionHash: HASH,
      status: "requested",
      createdAt: AT,
      acceptDeadlineAt: new Date(AT.getTime() + 86_400_000),
    });
    const [row] = await t.db.select().from(redemptions);
    expect(row).toMatchObject({ status: "requested", acceptedAt: null, miss: null });
  });
});
