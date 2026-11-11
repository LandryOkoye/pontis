// Stats rows to the API's `MarketSnapshot`, and the choice between real and simulated rows
// (ADR 0015 section 1). Pure, so the honesty rule is tested without a database.

import type { MarketSnapshot } from "@pontis/api-types";
import type { assetMarketStats } from "@pontis/db";
import { formatPrice, parsePrice, type DataFilter } from "@pontis/domain";

export type StatsRow = typeof assetMarketStats.$inferSelect;

/** `numeric(48, 8)` text such as `12.50000000` to the trimmed API form `12.5`. */
export const priceText = (value: string): string => formatPrice(parsePrice(value));

/**
 * The row a read should use for one representation. `all` prefers real data and falls back to
 * simulated; it never mixes the two figures of one row.
 */
export function pickStats(rows: readonly StatsRow[], filter: DataFilter): StatsRow | undefined {
  const real = rows.find((r) => !r.simulated);
  const simulated = rows.find((r) => r.simulated);
  if (filter === "real") return real;
  if (filter === "simulated") return simulated;
  return real ?? simulated;
}

export function toSnapshot(row: StatsRow): MarketSnapshot {
  return {
    price: priceText(row.price),
    currency: row.currency,
    priceAsOf: row.priceAsOf.toISOString(),
    change24hBps: row.change24hBps,
    change7dBps: row.change7dBps,
    change30dBps: row.change30dBps,
    supply: row.supply,
    marketCap: row.marketCap === null ? null : priceText(row.marketCap),
    volume24h: priceText(row.volume24h),
    tvl: row.tvl === null ? null : priceText(row.tvl),
    rank: row.rank,
    sources: row.sources,
    simulated: row.simulated,
  };
}
