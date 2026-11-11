// Migration 0008: the stored payout instruction and the refusal mirror.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redemptionPayoutInstructions, redemptionRefusals } from "../src/index.ts";
import { createTestDb, type TestDb } from "../src/testing.ts";

const HASH = "ab".repeat(32);
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});

const prepared = (over: Partial<typeof redemptionPayoutInstructions.$inferInsert> = {}) => ({
  accountId: "alice.testnet",
  representationId: "tgold-a",
  amount: "5000000",
  termsHash: "cd".repeat(32),
  payoutInstructionHash: HASH,
  ciphertext: "AAECAwQFBgc=",
  ...over,
});

describe("redemption_payout_instructions", () => {
  it("gets an id and a time, and no redemption until the indexer links one", async () => {
    const [row] = await t.db.insert(redemptionPayoutInstructions).values(prepared()).returning();
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.redemptionId).toBeNull();
  });

  it("allows the same ciphertext to be prepared twice, as separate rows", async () => {
    await t.db.insert(redemptionPayoutInstructions).values(prepared({ accountId: "bob.testnet" }));
    await t.db.insert(redemptionPayoutInstructions).values(prepared({ accountId: "bob.testnet" }));
    const rows = await t.db
      .select()
      .from(redemptionPayoutInstructions)
      .where(eq(redemptionPayoutInstructions.accountId, "bob.testnet"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it("stores amounts up to u128", async () => {
    const max = ((1n << 128n) - 1n).toString();
    const [row] = await t.db
      .insert(redemptionPayoutInstructions)
      .values(prepared({ accountId: "carol.testnet", amount: max }))
      .returning();
    expect(row?.amount).toBe(max);
  });
});

describe("redemption_refusals", () => {
  const refusal = (over: Partial<typeof redemptionRefusals.$inferInsert> = {}) => ({
    receiptId: "r1",
    logIndex: 0,
    blockHeight: 10,
    reason: "TERMS_CHANGED",
    senderId: "alice.testnet",
    token: "tgold-a.testnet",
    amount: "5000000",
    at: new Date("2026-11-11T12:00:00Z"),
    ...over,
  });

  it("keeps one row per event: a replay of (receipt, log index) is refused by the key", async () => {
    await t.db.insert(redemptionRefusals).values(refusal());
    await expect(t.db.insert(redemptionRefusals).values(refusal())).rejects.toThrow();
    await t.db.insert(redemptionRefusals).values(refusal({ logIndex: 1 }));
    const rows = await t.db.select().from(redemptionRefusals);
    expect(rows).toHaveLength(2);
  });
});
