// One pass of every market job, in dependency order (ADR 0015 section 4). The indexer process
// calls it on a timer; the simulator calls it after a backfill.

import type { Db } from "@pontis/db";
import { rebuildCandles } from "./candle-builder.ts";
import { refreshSearchIndex } from "./search.ts";
import { refreshMarketStats } from "./stats-refresh.ts";
import { syncTrades } from "./trades.ts";

export interface MarketJobsResult {
  trades: number;
  candles: number;
  stats: number;
  searchDocuments: number;
}

/** Candles are rebuilt for the buckets that overlap `[now - windowMs, now)`; older ones are kept. */
export async function runMarketJobsOnce(
  db: Db,
  now: Date,
  windowMs: number,
): Promise<MarketJobsResult> {
  const trades = await syncTrades(db);
  const { candles } = await rebuildCandles(db, {
    from: new Date(now.getTime() - windowMs),
    to: now,
  });
  const { rows } = await refreshMarketStats(db, now);
  const searchDocuments = await refreshSearchIndex(db, now);
  return { trades, candles, stats: rows, searchDocuments };
}
