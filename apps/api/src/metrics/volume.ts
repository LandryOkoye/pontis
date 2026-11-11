// Volume, fees and vault inventory (spec section 4), in base units per representation. Amounts
// of different tokens are never added together.

import type { MetricWindow } from "@pontis/api-types";
import { assetRepresentations, quotes } from "@pontis/db";
import { and, eq, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { inWindow, perWindow, type ComputedBreakdown, type MetricsContext } from "./core.ts";

async function settledSum(
  ctx: MetricsContext,
  window: MetricWindow,
  group: PgColumn,
  amount: PgColumn,
): Promise<Record<string, string>> {
  const rows = await ctx.db
    .select({ id: group, total: sql<string>`sum(${amount})::text` })
    .from(quotes)
    .where(and(eq(quotes.state, "SETTLED"), inWindow(quotes.updatedAt, window, ctx.now)))
    .groupBy(group);
  return Object.fromEntries(rows.map((r) => [String(r.id), r.total]));
}

/** `sum(quotes.amount_in)` of settled quotes, by the `from` representation. */
export async function volumeInput(ctx: MetricsContext): Promise<ComputedBreakdown> {
  return {
    values: await perWindow((w) => settledSum(ctx, w, quotes.fromId, quotes.amountIn)),
    simulated: ctx.tradingSynthetic,
  };
}

/** `sum(quotes.fee)` of settled quotes, by the `to` representation (fees are paid in the output token). */
export async function feesCollected(ctx: MetricsContext): Promise<ComputedBreakdown> {
  return {
    values: await perWindow((w) => settledSum(ctx, w, quotes.toId, quotes.fee)),
    simulated: ctx.tradingSynthetic,
  };
}

/** What `pontis-core` records as owed to the vault, per representation, as mirrored. */
export async function vaultInventory(ctx: MetricsContext): Promise<ComputedBreakdown> {
  const rows = await ctx.db
    .select({
      id: assetRepresentations.id,
      inventory: assetRepresentations.vaultInventory,
      synthetic: assetRepresentations.synthetic,
    })
    .from(assetRepresentations);
  return {
    value: Object.fromEntries(rows.map((r) => [r.id, r.inventory])),
    simulated: rows.some((r) => r.synthetic),
  };
}
