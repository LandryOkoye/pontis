// Quote state changes that do not need the chain: expiry and lookup (BuildPlan B10, brief §7.4).

import type { Quote } from "@pontis/api-types";
import { and, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@pontis/db";
import { quotes } from "@pontis/db";
import { quoteFromRow } from "./quote-mapper.ts";

/** Marks quotes past their expiry as EXPIRED (QUOTED and ACCEPTED only); returns how many changed. */
export async function expireQuotes(db: Db, now: Date): Promise<number> {
  const rows = await db
    .update(quotes)
    .set({ state: "EXPIRED", updatedAt: now })
    .where(and(inArray(quotes.state, ["QUOTED", "ACCEPTED"]), lte(quotes.expiresAt, now)))
    .returning({ id: quotes.id });
  return rows.length;
}

export async function getQuote(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<Quote | undefined> {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!row) return undefined;
  const open = row.state === "QUOTED" || row.state === "ACCEPTED";
  if (!open || row.expiresAt > now) return quoteFromRow(row);
  const [expired] = await db
    .update(quotes)
    .set({ state: "EXPIRED", updatedAt: now })
    .where(and(eq(quotes.id, id), inArray(quotes.state, ["QUOTED", "ACCEPTED"])))
    .returning();
  return quoteFromRow(expired ?? row);
}
