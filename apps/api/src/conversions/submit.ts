// POST /v1/conversions/{id}/submitted (BuildPlan B11): the frontend reports the hash of the
// transaction it sent. Repeating the same hash is a no-op; a different hash is a conflict. A quote
// that expired before the hash was reported is refused: the indexer (B12) reconciles from chain
// events by nonce, so no settlement is lost. If the indexer already settled the conversion, the
// hash is still recorded, on the conversion and on its events.

import type { Transaction } from "@pontis/api-types";
import type { QuoteState } from "@pontis/domain";
import type { Db } from "@pontis/db";
import { conversions, quotes, settlementEvents } from "@pontis/db";
import { and, eq, isNull } from "drizzle-orm";
import { AppError, notFound } from "../errors.ts";
import { getTransaction } from "./transactions.ts";

const SETTLED_BY_CHAIN = new Set<QuoteState>(["SETTLED", "FAILED", "REQUIRES_RECONCILIATION"]);

async function reported(db: Db, conversionId: string): Promise<Transaction> {
  const found = await getTransaction(db, conversionId);
  if (!found) throw new Error("conversion vanished");
  return found;
}

export async function reportSubmitted(
  db: Db,
  conversionId: string,
  txHash: string,
  now: Date = new Date(),
): Promise<Transaction> {
  const [row] = await db
    .select({ conversion: conversions, quote: quotes })
    .from(conversions)
    .innerJoin(quotes, eq(quotes.id, conversions.quoteId))
    .where(eq(conversions.id, conversionId));
  if (!row) throw notFound("Conversion");
  const { conversion, quote } = row;
  if (conversion.txHash) {
    if (conversion.txHash === txHash) return reported(db, conversionId);
    throw new AppError(
      "QUOTE_ALREADY_USED",
      409,
      "A different transaction was already reported for this conversion",
    );
  }
  if (SETTLED_BY_CHAIN.has(quote.state)) {
    // The indexer saw the result before the wallet reported the hash; keep the hash for the record.
    await db.transaction(async (tx) => {
      await tx.update(conversions).set({ txHash }).where(eq(conversions.id, conversionId));
      await tx
        .update(settlementEvents)
        .set({ txHash })
        .where(
          and(eq(settlementEvents.conversionId, conversionId), isNull(settlementEvents.txHash)),
        );
    });
    return reported(db, conversionId);
  }
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

  await db.transaction(async (tx) => {
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
    await tx
      .update(conversions)
      .set({ txHash, submittedAt: now })
      .where(eq(conversions.id, conversionId));
  });
  return reported(db, conversionId);
}
