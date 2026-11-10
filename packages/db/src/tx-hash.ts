// Reported versus verified transaction hashes of a conversion. The wallet reports a hash; only a
// hash the chain confirmed (near-client's `verifyConversionTransaction`) ever reaches
// `conversions.tx_hash` and `settlement_events.tx_hash`, which the API serves as `txHash`.

import { and, eq, inArray, sql } from "drizzle-orm";
import type { TxHashStatus } from "@pontis/domain";
import type { Db, DbTx } from "./client.ts";
import { assetRepresentations } from "./schema/registry.ts";
import { auditLog, conversions, quotes, settlementEvents } from "./schema/trading.ts";

type Handle = Db | DbTx;

/** Everything needed to decide whether a hash is a conversion's transaction. */
export interface ConversionTxContext {
  conversionId: string;
  quoteId: string;
  accountId: string;
  amountIn: string;
  nonce: string;
  /** Token contract of the quote's source asset. */
  tokenIn: string;
  reportedTxHash: string | null;
  status: TxHashStatus;
  /** Receipts of the settlement events the indexer attributed to this conversion; empty if none yet. */
  settlementReceiptIds: string[];
}

/**
 * Settlement events that can anchor a hash. A `conversion_rejected` with `NONCE_USED` belongs to a
 * replay of the nonce, not to the transaction that used it.
 */
export const isAnchoringEvent = sql`(${settlementEvents.eventName} in ('conversion_completed', 'conversion_failed')
  or (${settlementEvents.eventName} = 'conversion_rejected' and ${settlementEvents.data}->>'reason' is distinct from 'NONCE_USED'))`;

export async function loadConversionTxContext(
  db: Handle,
  conversionId: string,
): Promise<ConversionTxContext | undefined> {
  const [row] = await db
    .select({
      conversion: conversions,
      quote: quotes,
      tokenIn: assetRepresentations.accountId,
    })
    .from(conversions)
    .innerJoin(quotes, eq(quotes.id, conversions.quoteId))
    .innerJoin(assetRepresentations, eq(assetRepresentations.id, quotes.fromId))
    .where(eq(conversions.id, conversionId));
  if (!row) return undefined;
  const events = await db
    .select({ receiptId: settlementEvents.receiptId })
    .from(settlementEvents)
    .where(and(eq(settlementEvents.conversionId, conversionId), isAnchoringEvent));
  return {
    conversionId,
    quoteId: row.quote.id,
    accountId: row.quote.accountId,
    amountIn: row.quote.amountIn,
    nonce: row.quote.nonce,
    tokenIn: row.tokenIn,
    reportedTxHash: row.conversion.reportedTxHash,
    status: row.conversion.txHashStatus,
    settlementReceiptIds: [...new Set(events.map((e) => e.receiptId))],
  };
}

/** Stores `txHash` as reported and verified, and attributes it to the events whose receipts it produced. */
export async function markTxHashVerified(
  tx: DbTx,
  p: { conversionId: string; txHash: string; txReceiptIds: readonly string[]; at: Date },
): Promise<void> {
  await tx
    .update(conversions)
    .set({
      reportedTxHash: p.txHash,
      txHash: p.txHash,
      txHashStatus: "VERIFIED",
      txHashCheckedAt: p.at,
    })
    .where(eq(conversions.id, p.conversionId));
  if (p.txReceiptIds.length === 0) return;
  await tx
    .update(settlementEvents)
    .set({ txHash: p.txHash })
    .where(
      and(
        eq(settlementEvents.conversionId, p.conversionId),
        inArray(settlementEvents.receiptId, [...p.txReceiptIds]),
      ),
    );
}

/**
 * The chain says `txHash` is not this conversion's transaction: keep what was reported for the
 * record, clear anything verified, and leave an audit row. A no-op if the reported hash changed meanwhile.
 */
export async function markTxHashRejected(
  tx: DbTx,
  p: { conversionId: string; txHash: string; reason: string; actor: string; at: Date },
): Promise<void> {
  const moved = await tx
    .update(conversions)
    .set({ txHash: null, txHashStatus: "REJECTED", txHashCheckedAt: p.at })
    .where(and(eq(conversions.id, p.conversionId), eq(conversions.reportedTxHash, p.txHash)))
    .returning({ id: conversions.id });
  if (moved.length === 0) return;
  await tx
    .update(settlementEvents)
    .set({ txHash: null })
    .where(eq(settlementEvents.conversionId, p.conversionId));
  await tx.insert(auditLog).values({
    actor: p.actor,
    action: "conversion.tx_hash_rejected",
    subject: p.conversionId,
    detail: { reportedTxHash: p.txHash, reason: p.reason },
  });
}
