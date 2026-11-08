// POST /v1/conversions/{id}/submitted (BuildPlan B11): the frontend reports the hash of the
// transaction it sent. Repeating the same hash is a no-op; a different hash is a conflict. A quote
// that expired before the hash was reported is refused: the indexer (B12) reconciles from chain
// events by nonce, so no settlement is lost.

import type { Transaction } from "@pontis/api-types";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { conversions, quotes } from "../db/schema/index.ts";
import { AppError, notFound } from "../errors.ts";
import { getTransaction } from "./transactions.ts";

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
