// Conversion history: a conversion joined with its quote and the settlement events the indexer
// (B12) attributed to it. `state` is the quote state; `txHash` is what the frontend reported.

import type { Transaction } from "@pontis/api-types";
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { conversions, quotes, settlementEvents } from "../db/schema/index.ts";
import { quoteFromRow } from "../quotes/quote-mapper.ts";

type ConversionRow = typeof conversions.$inferSelect;
type QuoteRow = typeof quotes.$inferSelect;
type EventRow = typeof settlementEvents.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toTransaction(c: ConversionRow, q: QuoteRow, events: EventRow[]): Transaction {
  return {
    id: c.id,
    quote: quoteFromRow(q),
    state: q.state,
    txHash: c.txHash,
    failureReason: c.failureReason,
    events: events.map((e) => ({
      eventName: e.eventName,
      receiptId: e.receiptId,
      logIndex: e.logIndex,
      blockHeight: e.blockHeight,
      blockTimestamp: e.blockTimestamp.toISOString(),
      txHash: e.txHash,
      data: e.data,
    })),
    createdAt: c.createdAt.toISOString(),
    submittedAt: iso(c.submittedAt),
    settledAt: iso(c.settledAt),
  };
}

async function withEvents(
  db: Db,
  rows: { conversion: ConversionRow; quote: QuoteRow }[],
): Promise<Transaction[]> {
  if (rows.length === 0) return [];
  const events = await db
    .select()
    .from(settlementEvents)
    .where(
      inArray(
        settlementEvents.conversionId,
        rows.map((r) => r.conversion.id),
      ),
    )
    .orderBy(settlementEvents.blockHeight, settlementEvents.logIndex);
  return rows.map((r) =>
    toTransaction(
      r.conversion,
      r.quote,
      events.filter((e) => e.conversionId === r.conversion.id),
    ),
  );
}

export async function getTransaction(db: Db, id: string): Promise<Transaction | undefined> {
  const rows = await db
    .select({ conversion: conversions, quote: quotes })
    .from(conversions)
    .innerJoin(quotes, eq(quotes.id, conversions.quoteId))
    .where(eq(conversions.id, id));
  return (await withEvents(db, rows))[0];
}

/** Newest first. */
export async function listTransactions(
  db: Db,
  account: string,
  limit: number,
): Promise<Transaction[]> {
  const rows = await db
    .select({ conversion: conversions, quote: quotes })
    .from(conversions)
    .innerJoin(quotes, eq(quotes.id, conversions.quoteId))
    .where(eq(quotes.accountId, account))
    .orderBy(desc(conversions.createdAt))
    .limit(limit);
  return withEvents(db, rows);
}
