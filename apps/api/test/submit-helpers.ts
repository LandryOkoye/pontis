// Shared by the tests that report transaction hashes: an accepted conversion, a fake node and the
// facts a conversion's transaction must have.

import type { Db } from "@pontis/db";
import { conversions, loadConversionTxContext, quotes, settlementEvents } from "@pontis/db";
import type { ExpectedConversionTx, TxFacts, TxVerifier } from "@pontis/near-client";
import { eq } from "drizzle-orm";
import { acceptQuote } from "../src/conversions/accept.ts";
import type { SubmitDeps } from "../src/conversions/submit.ts";
import { createQuote } from "../src/quotes/service.ts";
import { testAppDeps } from "./helpers.ts";

export const NOW = new Date("2026-11-07T18:00:00Z");
export const HASH = "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T";
export const OTHER = "other-hash-other-hash-other-hash-xx";

/** A fresh quote for 1 TGOLD-A, accepted at `NOW`. */
export async function acceptConversion(
  db: Db,
  account = "alice.testnet",
  key = crypto.randomUUID(),
) {
  const q = await createQuote(
    { db, ...testAppDeps(db).quotes, now: () => NOW },
    { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: account },
  );
  const res = await acceptQuote(
    { db, chain: { isRegistered: async () => true }, coreId: "core.testnet", now: () => NOW },
    q.id,
    key,
  );
  return { quote: q, conversionId: res.conversionId };
}

export const submitDeps = (db: Db, verifier: TxVerifier, warnings: unknown[] = []): SubmitDeps => ({
  db,
  verifier,
  coreId: "core.testnet",
  log: { warn: (fields) => void warnings.push(fields) },
  now: NOW,
});

/** A node that knows no transaction. */
export const unknownTx: TxVerifier = { getTransaction: async () => undefined };
/** A node that knows `facts` under any hash. */
export const knows = (facts: TxFacts): TxVerifier => ({ getTransaction: async () => facts });

/** What a transaction must be to belong to the conversion, built from the stored rows. */
export async function expectedFor(db: Db, conversionId: string): Promise<ExpectedConversionTx> {
  const ctx = await loadConversionTxContext(db, conversionId);
  if (!ctx) throw new Error("no conversion");
  return {
    signerId: ctx.accountId,
    tokenIn: ctx.tokenIn,
    coreId: "core.testnet",
    amountIn: ctx.amountIn,
    nonce: ctx.nonce,
    settlementReceiptIds: ctx.settlementReceiptIds,
  };
}

export const storedConversion = async (db: Db, conversionId: string) =>
  (await db.select().from(conversions).where(eq(conversions.id, conversionId)))[0];

/** An accepted conversion the indexer has settled with one `conversion_completed` event (no hash on it). */
export async function settledByChain(db: Db) {
  const made = await acceptConversion(db);
  await db.update(quotes).set({ state: "SETTLED" }).where(eq(quotes.id, made.quote.id));
  await db.insert(settlementEvents).values({
    receiptId: `late-${made.conversionId}`,
    logIndex: 0,
    blockHeight: 9,
    blockTimestamp: NOW,
    txHash: null,
    eventName: "conversion_completed",
    data: {},
    conversionId: made.conversionId,
  });
  return made;
}
