// Verifies the transaction hashes wallets reported for conversions the indexer has settled. A
// reported hash is only a claim: it becomes the conversion's `txHash` (and the events') when the
// chain shows that transaction is this conversion's and produced one of the settlement receipts.
// A hash the node cannot confirm stays reported and is tried again later; one the chain contradicts
// is rejected and audited. Runs after a block's transaction commits, so an RPC failure here never
// blocks indexing.

import {
  conversions,
  isAnchoringEvent,
  loadConversionTxContext,
  markTxHashRejected,
  markTxHashVerified,
  settlementEvents,
  type Db,
} from "@pontis/db";
import { verifyConversionTransaction, type TxVerifier } from "@pontis/near-client";
import { and, asc, eq, exists, isNotNull, isNull, lt, notExists, or, sql } from "drizzle-orm";
import type { Logger } from "./indexer.ts";

export interface VerifyHashesOptions {
  db: Db;
  verifier: TxVerifier;
  coreId: string;
  log: Logger;
  now?: () => Date;
  /** How long after an inconclusive attempt a hash is tried again. */
  retryAfterMs?: number;
  /** Most conversions checked per call, to bound RPC load. */
  batch?: number;
}

export const DEFAULT_VERIFY_RETRY_MS = 60_000;
const DEFAULT_BATCH = 20;

export interface VerifyHashesResult {
  verified: number;
  rejected: number;
  /** Not found or node unavailable: still reported, tried again later. */
  inconclusive: number;
}

const anchoringEventOf = (conversionId: typeof conversions.id) =>
  and(eq(settlementEvents.conversionId, conversionId), isAnchoringEvent);

/** An outcome event of the conversion that is already attributed to its verified hash. */
const tied = (db: Db) =>
  db
    .select({ one: sql`1` })
    .from(settlementEvents)
    .where(and(anchoringEventOf(conversions.id), isNotNull(settlementEvents.txHash)));

/** Conversions with a reported hash and an outcome event whose receipt is not yet tied to a hash. */
async function due(options: VerifyHashesOptions, now: Date): Promise<string[]> {
  const { db } = options;
  const retryBefore = new Date(now.getTime() - (options.retryAfterMs ?? DEFAULT_VERIFY_RETRY_MS));
  const rows = await db
    .select({ id: conversions.id })
    .from(conversions)
    .where(
      and(
        isNotNull(conversions.reportedTxHash),
        // A hash the API verified before any outcome event existed is checked once more, against
        // the receipts, until an outcome event has been tied to it.
        or(
          eq(conversions.txHashStatus, "REPORTED"),
          and(eq(conversions.txHashStatus, "VERIFIED"), notExists(tied(db))),
        ),
        or(isNull(conversions.txHashCheckedAt), lt(conversions.txHashCheckedAt, retryBefore)),
        exists(
          db
            .select({ one: sql`1` })
            .from(settlementEvents)
            .where(and(anchoringEventOf(conversions.id), isNull(settlementEvents.txHash))),
        ),
      ),
    )
    .orderBy(asc(conversions.txHashCheckedAt))
    .limit(options.batch ?? DEFAULT_BATCH);
  return rows.map((r) => r.id);
}

export async function verifyReportedHashes(
  options: VerifyHashesOptions,
): Promise<VerifyHashesResult> {
  const { db, verifier, coreId, log } = options;
  const now = (options.now ?? (() => new Date()))();
  const result: VerifyHashesResult = { verified: 0, rejected: 0, inconclusive: 0 };
  for (const conversionId of await due(options, now)) {
    const ctx = await loadConversionTxContext(db, conversionId);
    const txHash = ctx?.reportedTxHash;
    if (!ctx || !txHash || ctx.settlementReceiptIds.length === 0) continue;
    const verdict = await verifyConversionTransaction(verifier, txHash, {
      signerId: ctx.accountId,
      tokenIn: ctx.tokenIn,
      coreId,
      amountIn: ctx.amountIn,
      nonce: ctx.nonce,
      settlementReceiptIds: ctx.settlementReceiptIds,
    });
    switch (verdict.outcome) {
      case "VERIFIED":
        await db.transaction((tx) =>
          markTxHashVerified(tx, {
            conversionId,
            txHash,
            txReceiptIds: verdict.receiptIds,
            at: now,
          }),
        );
        result.verified++;
        break;
      case "MISMATCH":
        await db.transaction((tx) =>
          markTxHashRejected(tx, {
            conversionId,
            txHash,
            reason: verdict.reason,
            actor: "indexer",
            at: now,
          }),
        );
        log.error("reported transaction hash rejected", {
          conversionId,
          txHash,
          reason: verdict.reason,
        });
        result.rejected++;
        break;
      default:
        await db
          .update(conversions)
          .set({ txHashCheckedAt: now })
          .where(and(eq(conversions.id, conversionId), eq(conversions.reportedTxHash, txHash)));
        if (verdict.outcome === "UNAVAILABLE")
          log.error("could not verify a reported transaction hash; will retry", {
            conversionId,
            txHash,
            error: verdict.error,
          });
        result.inconclusive++;
    }
  }
  return result;
}
