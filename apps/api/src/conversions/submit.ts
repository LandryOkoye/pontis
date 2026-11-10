// POST /v1/conversions/{id}/submitted (BuildPlan B11): the frontend reports the hash of the
// transaction it sent. The hash is only a claim, so it is checked against the chain before it is
// presented as the conversion's transaction (`txHash`, status VERIFIED):
//   - a transaction that exists but is not this conversion's is refused (422) and nothing is stored;
//   - a hash the node does not know yet, or a node that cannot be reached, is stored as reported only.
// Repeating the same hash re-checks it while it is only reported; a different hash is a conflict. A
// quote that expired before the hash was reported is refused: the indexer (B12) reconciles from
// chain events by nonce, so no settlement is lost. If the indexer already settled the conversion,
// the hash is checked against that settlement's receipts too.

import type { Transaction } from "@pontis/api-types";
import type { QuoteState } from "@pontis/domain";
import type { Db } from "@pontis/db";
import {
  conversions,
  loadConversionTxContext,
  markTxHashRejected,
  markTxHashVerified,
  quotes,
  type ConversionTxContext,
} from "@pontis/db";
import { verifyConversionTransaction, type TxVerdict, type TxVerifier } from "@pontis/near-client";
import { and, eq } from "drizzle-orm";
import { AppError, notFound } from "../errors.ts";
import { getTransaction } from "./transactions.ts";

const SETTLED_BY_CHAIN = new Set<QuoteState>(["SETTLED", "FAILED", "REQUIRES_RECONCILIATION"]);

export interface SubmitDeps {
  db: Db;
  verifier: TxVerifier;
  coreId: string;
  log: { warn(fields: Record<string, unknown>, message: string): void };
  now?: Date;
}

async function reported(db: Db, conversionId: string): Promise<Transaction> {
  const found = await getTransaction(db, conversionId);
  if (!found) throw new Error("conversion vanished");
  return found;
}

async function verify(
  deps: SubmitDeps,
  ctx: ConversionTxContext,
  txHash: string,
): Promise<TxVerdict> {
  const verdict = await verifyConversionTransaction(deps.verifier, txHash, {
    signerId: ctx.accountId,
    tokenIn: ctx.tokenIn,
    coreId: deps.coreId,
    amountIn: ctx.amountIn,
    nonce: ctx.nonce,
    settlementReceiptIds: ctx.settlementReceiptIds,
  });
  if (verdict.outcome === "UNAVAILABLE")
    deps.log.warn(
      { conversionId: ctx.conversionId, txHash, error: verdict.error },
      "could not verify the reported transaction; stored as reported only",
    );
  return verdict;
}

const notThisConversion = (reason: string) =>
  new AppError("VALIDATION_ERROR", 422, `That transaction is not this conversion's: ${reason}`);

export async function reportSubmitted(
  deps: SubmitDeps,
  conversionId: string,
  txHash: string,
): Promise<Transaction> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const [row] = await db
    .select({ conversion: conversions, quote: quotes })
    .from(conversions)
    .innerJoin(quotes, eq(quotes.id, conversions.quoteId))
    .where(eq(conversions.id, conversionId));
  if (!row) throw notFound("Conversion");
  const { conversion, quote } = row;
  const ctx = await loadConversionTxContext(db, conversionId);
  if (!ctx) throw new Error("conversion vanished");

  if (conversion.reportedTxHash && conversion.txHashStatus !== "REJECTED") {
    if (conversion.reportedTxHash !== txHash)
      throw new AppError(
        "QUOTE_ALREADY_USED",
        409,
        "A different transaction was already reported for this conversion",
      );
    if (conversion.txHashStatus === "VERIFIED") return reported(db, conversionId);
    // Still only reported: the node may know the transaction by now.
    const verdict = await verify(deps, ctx, txHash);
    await db.transaction(async (tx) => {
      if (verdict.outcome === "VERIFIED")
        await markTxHashVerified(tx, {
          conversionId,
          txHash,
          txReceiptIds: verdict.receiptIds,
          at: now,
        });
      else if (verdict.outcome === "MISMATCH")
        await markTxHashRejected(tx, {
          conversionId,
          txHash,
          reason: verdict.reason,
          actor: "api",
          at: now,
        });
    });
    if (verdict.outcome === "MISMATCH") throw notThisConversion(verdict.reason);
    return reported(db, conversionId);
  }

  const settled = SETTLED_BY_CHAIN.has(quote.state);
  if (!settled) {
    if (quote.state === "ACCEPTED" && quote.expiresAt <= now) {
      await db
        .update(quotes)
        .set({ state: "EXPIRED", updatedAt: now })
        .where(and(eq(quotes.id, quote.id), eq(quotes.state, "ACCEPTED")));
      throw new AppError(
        "QUOTE_EXPIRED",
        410,
        "The quote expired before the transaction was reported",
      );
    }
    if (quote.state === "EXPIRED")
      throw new AppError(
        "QUOTE_EXPIRED",
        410,
        "The quote expired before the transaction was reported",
      );
    if (quote.state !== "ACCEPTED")
      throw new AppError("QUOTE_ALREADY_USED", 409, `The conversion is already ${quote.state}`);
  }

  const verdict = await verify(deps, ctx, txHash);
  if (verdict.outcome === "MISMATCH") throw notThisConversion(verdict.reason);

  await db.transaction(async (tx) => {
    if (!settled) {
      // The indexer saw the result before the wallet reported the hash when `settled`; keep the
      // state it set. Otherwise the report is what moves the quote to SUBMITTED.
      const moved = await tx
        .update(quotes)
        .set({ state: "SUBMITTED", updatedAt: now })
        .where(and(eq(quotes.id, quote.id), eq(quotes.state, "ACCEPTED")))
        .returning({ id: quotes.id });
      if (moved.length === 0)
        throw new AppError(
          "QUOTE_ALREADY_USED",
          409,
          "The conversion changed while reporting the transaction",
        );
    }
    await tx
      .update(conversions)
      .set({
        reportedTxHash: txHash,
        txHashStatus: "REPORTED",
        txHashCheckedAt: now,
        ...(settled ? {} : { submittedAt: now }),
      })
      .where(eq(conversions.id, conversionId));
    if (verdict.outcome === "VERIFIED")
      await markTxHashVerified(tx, {
        conversionId,
        txHash,
        txReceiptIds: verdict.receiptIds,
        at: now,
      });
  });
  return reported(db, conversionId);
}
