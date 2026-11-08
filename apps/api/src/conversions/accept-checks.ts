// Preconditions of accepting a quote: a repeated request is answered from storage, and only an
// unexpired QUOTED quote can be accepted.

import type { CreateConversionResponse } from "@pontis/api-types";
import { canTransitionQuote } from "@pontis/domain";
import { and, eq } from "drizzle-orm";
import type { Db } from "@pontis/db";
import { conversions, quotes } from "@pontis/db";
import { AppError, notFound } from "../errors.ts";
import type { QuoteRow } from "../quotes/quote-mapper.ts";

export async function existingFor(
  db: Db,
  key: string,
  quoteId: string,
): Promise<CreateConversionResponse | undefined> {
  const [found] = await db.select().from(conversions).where(eq(conversions.idempotencyKey, key));
  if (!found) return undefined;
  if (found.quoteId !== quoteId) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Idempotency-Key was already used for a different quote",
    );
  }
  return { conversionId: found.id, quoteId, actions: found.plan };
}

export async function openQuote(db: Db, now: Date, quoteId: string): Promise<QuoteRow> {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) throw notFound("Quote");
  if (quote.state === "QUOTED" && quote.expiresAt <= now) {
    await db
      .update(quotes)
      .set({ state: "EXPIRED", updatedAt: now })
      .where(and(eq(quotes.id, quoteId), eq(quotes.state, "QUOTED")));
    throw new AppError("QUOTE_EXPIRED", 410, "The quote has expired; request a new one");
  }
  if (quote.state === "EXPIRED")
    throw new AppError("QUOTE_EXPIRED", 410, "The quote has expired; request a new one");
  if (!canTransitionQuote(quote.state, "ACCEPTED")) {
    throw new AppError("QUOTE_ALREADY_USED", 409, "The quote was already accepted");
  }
  return quote;
}
