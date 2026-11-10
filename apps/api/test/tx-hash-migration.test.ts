// Migration 0004 splits the reported hash from the verified one. Hashes stored before it were
// only ever what a wallet reported, so the migration moves them to `reported_tx_hash` and clears
// the verified columns. This runs the migration's own data statements on rows in the old shape.

import { readFileSync } from "node:fs";
import { MIGRATIONS_FOLDER, conversions, quotes, settlementEvents } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncRegistry } from "../src/sync/registry-sync.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const HASH = "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T";

async function legacyConversion(nonce: string, txHash: string | null) {
  const [q] = await t.db
    .insert(quotes)
    .values({
      accountId: "alice.testnet",
      fromId: "tgold-a",
      toId: "tgold-b",
      amountIn: "1000000",
      amountOutGross: "1000000000",
      fee: "1000000",
      amountOut: "999000000",
      ratioNum: "1000",
      ratioDen: "1",
      feeBps: 10,
      nonce,
      signature: "c2ln",
      expiresAt: new Date("2026-11-07T18:01:00Z"),
      compatibilityVersion: 2,
      policyVersion: 1,
      route: {},
      warnings: [],
      state: "SETTLED",
    })
    .returning();
  // The old shape: a reported hash lived in `tx_hash`, and the indexer copied it to the events.
  const [c] = await t.db
    .insert(conversions)
    .values({ quoteId: q!.id, idempotencyKey: `key-${nonce}`, txHash })
    .returning();
  await t.db.insert(settlementEvents).values({
    receiptId: `r-${nonce}`,
    logIndex: 0,
    blockHeight: 1,
    blockTimestamp: new Date(),
    txHash,
    eventName: "conversion_completed",
    data: {},
    conversionId: c!.id,
  });
  return c!.id;
}

describe("migration 0004: tx hash verification", () => {
  it("keeps old hashes as reported, clears the verified columns and leaves other rows alone", async () => {
    const withHash = await legacyConversion("a".repeat(32), HASH);
    const without = await legacyConversion("b".repeat(32), null);
    const sql = readFileSync(`${MIGRATIONS_FOLDER}/0004_tx_hash_verification.sql`, "utf8");
    const dataStatements = sql
      .split("--> statement-breakpoint")
      .filter((s) => /\bUPDATE\b/.test(s));
    expect(dataStatements).toHaveLength(3);
    for (const statement of dataStatements) await t.pool.query(statement);

    const [a] = await t.db.select().from(conversions).where(eq(conversions.id, withHash));
    expect([a?.reportedTxHash, a?.txHash, a?.txHashStatus]).toEqual([HASH, null, "REPORTED"]);
    const [b] = await t.db.select().from(conversions).where(eq(conversions.id, without));
    expect([b?.reportedTxHash, b?.txHash, b?.txHashStatus]).toEqual([null, null, "NONE"]);
    const events = await t.db.select().from(settlementEvents);
    expect(events.filter((e) => e.conversionId === withHash).map((e) => e.txHash)).toEqual([null]);
  });
});
