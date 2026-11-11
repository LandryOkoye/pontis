// Latency and indexer (spec section 2). Percentiles come from `percentile_cont` in SQL over
// seconds, so they pass through a double before being rounded to 3 places.

import { conversions, indexerCursor, quotes } from "@pontis/db";
import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { INDEXER_CURSOR_NAME } from "../routes/health.ts";
import type { MetricValue } from "@pontis/api-types";
import {
  inWindow,
  perWindow,
  secondsFromMs,
  type Computed,
  type MetricsContext,
  type Windowed,
} from "./core.ts";

/** Seconds between two instants; a negative gap (clock skew between database and chain) counts as 0. */
const gap = (later: SQL | unknown, earlier: SQL | unknown) =>
  sql`greatest(0, extract(epoch from (${later} - ${earlier})))`;

async function percentile(
  ctx: MetricsContext,
  fraction: "0.5" | "0.95",
  start: typeof quotes.createdAt | typeof conversions.submittedAt,
): Promise<Windowed<MetricValue>> {
  return perWindow(async (w) => {
    const [row] = await ctx.db
      .select({
        v: sql<
          string | null
        >`round(percentile_cont(${sql.raw(fraction)}) within group (order by ${gap(conversions.settledAt, start)})::float8::numeric, 3)::text`,
      })
      .from(conversions)
      .innerJoin(quotes, eq(conversions.quoteId, quotes.id))
      .where(
        and(
          eq(quotes.state, "SETTLED"),
          isNotNull(conversions.settledAt),
          isNotNull(start),
          inWindow(conversions.settledAt, w, ctx.now),
        ),
      );
    return row?.v ?? null;
  });
}

export async function quoteToSettleLatency(
  ctx: MetricsContext,
  fraction: "0.5" | "0.95",
): Promise<Computed> {
  return {
    values: await percentile(ctx, fraction, quotes.createdAt),
    simulated: ctx.tradingSynthetic,
  };
}

export async function submitToSettleLatencyP95(ctx: MetricsContext): Promise<Computed> {
  return {
    values: await percentile(ctx, "0.95", conversions.submittedAt),
    simulated: ctx.tradingSynthetic,
  };
}

async function cursor(ctx: MetricsContext) {
  const [row] = await ctx.db
    .select()
    .from(indexerCursor)
    .where(eq(indexerCursor.name, INDEXER_CURSOR_NAME));
  return row;
}

/** Chain head minus the indexer cursor; null when the cursor is missing or the head cannot be read. */
export async function indexerLagBlocks(
  ctx: MetricsContext,
  chainHeight: () => Promise<number>,
): Promise<Computed> {
  const row = await cursor(ctx);
  const head = await chainHeight().catch(() => null);
  const value = row && head !== null ? Math.max(0, head - row.blockHeight) : null;
  return { value, simulated: false };
}

/** Age of the cursor's last write; the database stamps it, so a small skew is clamped to 0. */
export async function indexerHeartbeatAge(ctx: MetricsContext): Promise<Computed> {
  const row = await cursor(ctx);
  const value = row
    ? secondsFromMs(Math.max(0, ctx.now.getTime() - row.updatedAt.getTime()))
    : null;
  return { value, simulated: false };
}
