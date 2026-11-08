// Database-only checks: do stored quotes, conversions and events agree with each other?

import { conversions, quotes, settlementEvents, type Db } from "@pontis/db";
import { and, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { quoteDisagreement } from "../settle.ts";
import type { Candidate } from "./finding.ts";

const TERMINAL_EVENTS = ["conversion_completed", "conversion_failed", "conversion_rejected"];

/** `SUBMITTED` (or flagged) quotes with no outcome event long after the wallet reported the hash. */
export async function stuckQuotes(db: Db, now: Date, stuckAfterMs: number) {
  const cutoff = new Date(now.getTime() - stuckAfterMs);
  const rows = await db
    .select({ quote: quotes, conversion: conversions })
    .from(quotes)
    .innerJoin(conversions, eq(conversions.quoteId, quotes.id))
    .leftJoin(
      settlementEvents,
      and(
        eq(settlementEvents.conversionId, conversions.id),
        inArray(settlementEvents.eventName, TERMINAL_EVENTS),
      ),
    )
    .where(
      and(
        inArray(quotes.state, ["SUBMITTED", "REQUIRES_RECONCILIATION"]),
        sql`${conversions.submittedAt} <= ${cutoff}`,
        isNull(settlementEvents.id),
      ),
    );
  return rows;
}

export function stuckCandidate(quoteId: string, minutes: number): Candidate {
  return {
    key: `stuck:${quoteId}`,
    kind: "STUCK_SUBMITTED",
    severity: "critical",
    subject: quoteId,
    message: `No settlement event ${minutes} minutes after the transaction was reported`,
  };
}

/** Settled quotes and completion events from the last `lookbackMs` that do not tell the same story. */
export async function settlementCandidates(db: Db, since: Date): Promise<Candidate[]> {
  const rows = await db
    .select({ quote: quotes, event: settlementEvents })
    .from(quotes)
    .innerJoin(conversions, eq(conversions.quoteId, quotes.id))
    .leftJoin(
      settlementEvents,
      and(
        eq(settlementEvents.conversionId, conversions.id),
        eq(settlementEvents.eventName, "conversion_completed"),
      ),
    )
    .where(
      and(
        gte(quotes.updatedAt, since),
        or(eq(quotes.state, "SETTLED"), sql`${settlementEvents.id} is not null`),
      ),
    );
  const found: Candidate[] = [];
  for (const { quote, event } of rows) {
    if (quote.state === "SETTLED" && !event) {
      found.push({
        key: `no-event:${quote.id}`,
        kind: "SETTLED_WITHOUT_EVENT",
        severity: "critical",
        subject: quote.id,
        message: "The quote is SETTLED but no conversion_completed event is stored for it",
      });
    } else if (event && quote.state !== "SETTLED" && quote.state !== "REQUIRES_RECONCILIATION") {
      found.push({
        key: `not-settled:${quote.id}`,
        kind: "COMPLETION_NOT_SETTLED",
        severity: "critical",
        subject: quote.id,
        message: `A conversion_completed event is stored but the quote is ${quote.state}`,
      });
    } else if (event && quote.state === "SETTLED") {
      const mismatch = quoteDisagreement(quote, event.data as Record<string, unknown>);
      if (mismatch) {
        found.push({
          key: `mismatch:${quote.id}`,
          kind: "SETTLEMENT_MISMATCH",
          severity: "critical",
          subject: quote.id,
          message: `Settled, but ${mismatch}`,
        });
      }
    }
  }
  return found;
}
