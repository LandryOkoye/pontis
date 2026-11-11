// Conversion health (spec section 1): quotes, settlement events and the audit log.

import type { MetricWindow } from "@pontis/api-types";
import { auditLog, quotes, settlementEvents } from "@pontis/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { big, inWindow, perWindow, ratio6, type Computed, type MetricsContext } from "./core.ts";

const EXECUTED = ["SETTLED", "FAILED", "REQUIRES_RECONCILIATION"] as const;
const OUTCOMES = ["conversion_completed", "conversion_rejected", "conversion_failed"] as const;
export const REQUIRES_RECONCILIATION_ACTION = "quote.requires_reconciliation";

/** Quotes that reached the chain, by state, over those whose `updated_at` is in the window. */
async function executedByState(ctx: MetricsContext, window: MetricWindow) {
  const rows = await ctx.db
    .select({ state: quotes.state, n: sql<string>`count(*)::text` })
    .from(quotes)
    .where(and(inArray(quotes.state, EXECUTED), inWindow(quotes.updatedAt, window, ctx.now)))
    .groupBy(quotes.state);
  const count = (state: string) => big(rows.find((r) => r.state === state)?.n);
  return {
    settled: count("SETTLED"),
    executed: count("SETTLED") + count("FAILED") + count("REQUIRES_RECONCILIATION"),
  };
}

async function outcomeEvents(ctx: MetricsContext, window: MetricWindow) {
  const rows = await ctx.db
    .select({ name: settlementEvents.eventName, n: sql<string>`count(*)::text` })
    .from(settlementEvents)
    .where(
      and(
        inArray(settlementEvents.eventName, OUTCOMES),
        inWindow(settlementEvents.blockTimestamp, window, ctx.now),
      ),
    )
    .groupBy(settlementEvents.eventName);
  const refunded = rows
    .filter((r) => r.name !== "conversion_completed")
    .reduce((sum, r) => sum + big(r.n), 0n);
  return { refunded, total: rows.reduce((sum, r) => sum + big(r.n), 0n) };
}

/** Distinct quotes that entered `REQUIRES_RECONCILIATION` (audit rows by the indexer or the reconciler). */
async function entered(ctx: MetricsContext, window: MetricWindow): Promise<bigint> {
  const [row] = await ctx.db
    .select({ n: sql<string>`count(distinct ${auditLog.subject})::text` })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, REQUIRES_RECONCILIATION_ACTION),
        inWindow(auditLog.at, window, ctx.now),
      ),
    );
  return big(row?.n);
}

export async function conversionSuccessRate(ctx: MetricsContext): Promise<Computed> {
  const values = await perWindow(async (w) => {
    const { settled, executed } = await executedByState(ctx, w);
    return ratio6(settled, executed);
  });
  return { values, simulated: ctx.tradingSynthetic };
}

export async function refundRate(ctx: MetricsContext): Promise<Computed> {
  const values = await perWindow(async (w) => {
    const { refunded, total } = await outcomeEvents(ctx, w);
    return ratio6(refunded, total);
  });
  return { values, simulated: ctx.tradingSynthetic };
}

export async function requiresReconciliationRate(ctx: MetricsContext): Promise<Computed> {
  const values = await perWindow(async (w) => {
    const [numerator, { executed }] = await Promise.all([entered(ctx, w), executedByState(ctx, w)]);
    return ratio6(numerator, executed);
  });
  return { values, simulated: ctx.tradingSynthetic };
}

export async function requiresReconciliationOpen(ctx: MetricsContext): Promise<Computed> {
  const [row] = await ctx.db
    .select({ n: sql<string>`count(*)::text` })
    .from(quotes)
    .where(eq(quotes.state, "REQUIRES_RECONCILIATION"));
  return { value: Number(row?.n ?? 0), simulated: ctx.tradingSynthetic };
}

/** Mean seconds from the first audit row to the terminal `updated_at`, by the time of resolution. */
export async function requiresReconciliationMeanTimeToResolve(
  ctx: MetricsContext,
): Promise<Computed> {
  const firstEntry = ctx.db
    .select({ subject: auditLog.subject, at: sql<Date>`min(${auditLog.at})`.as("entered_at") })
    .from(auditLog)
    .where(eq(auditLog.action, REQUIRES_RECONCILIATION_ACTION))
    .groupBy(auditLog.subject)
    .as("first_entry");
  const values = await perWindow(async (w) => {
    const [row] = await ctx.db
      .select({
        mean: sql<
          string | null
        >`round(avg(greatest(0, extract(epoch from (${quotes.updatedAt} - ${firstEntry.at})))), 3)::text`,
      })
      .from(quotes)
      .innerJoin(firstEntry, sql`${firstEntry.subject} = ${quotes.id}::text`)
      .where(
        and(inArray(quotes.state, ["SETTLED", "FAILED"]), inWindow(quotes.updatedAt, w, ctx.now)),
      );
    return row?.mean ?? null;
  });
  return { values, simulated: ctx.tradingSynthetic };
}
