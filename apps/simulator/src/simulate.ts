// Orchestrates one simulated window: prices, NAV, supply, trades, then the market jobs that turn
// them into candles and stats. Reads the registry mirror for what to simulate.

import { assetRepresentations, pricePoints, type Db } from "@pontis/db";
import {
  SimulatedPriceFeed,
  feedConfigFor,
  rebuildCandles,
  refreshMarketStats,
  refreshSearchIndex,
  syncTrades,
} from "@pontis/market-data";
import { and, eq, max } from "drizzle-orm";
import type { SimRep } from "./flow.ts";
import { START_SUPPLY_TOKENS } from "./supply.ts";
import { writePrices, writeSupply, writeTrades } from "./write.ts";

const DAY_MS = 86_400_000;
/** One-minute and five-minute candles older than this are not built: the feed has one point per five minutes. */
const FINE_CANDLE_DAYS = 2;

/** Candles, stats and the search index over the window. Fine intervals only cover recent days. */
async function rebuildMarket(db: Db, fromMs: number, toMs: number): Promise<void> {
  await syncTrades(db);
  const to = new Date(toMs);
  await rebuildCandles(db, {
    from: new Date(fromMs),
    to,
    intervals: ["15m", "1h", "4h", "1d"],
  });
  await rebuildCandles(db, {
    from: new Date(Math.max(fromMs, toMs - FINE_CANDLE_DAYS * DAY_MS)),
    to,
    intervals: ["1m", "5m"],
  });
  await refreshMarketStats(db, to);
  await refreshSearchIndex(db, to);
}

export interface WindowResult {
  prices: number;
  navs: number;
  supply: number;
  trades: number;
  /** Representations in the registry that have no simulated profile, and so were left alone. */
  skipped: string[];
}

export async function loadSimulation(db: Db) {
  const rows = await db.select().from(assetRepresentations);
  const registry = rows.map((r) => ({
    id: r.id,
    canonicalAssetId: r.canonicalAssetId,
    decimals: r.decimals,
    unitMultiplier: { num: BigInt(r.unitMultiplierNum), den: BigInt(r.unitMultiplierDen) },
  }));
  const config = feedConfigFor(registry);
  const reps: SimRep[] = registry
    .filter((r) => config.representations[r.id])
    .map((r) => ({
      id: r.id,
      claimId: r.canonicalAssetId,
      decimals: r.decimals,
      multiplier: r.unitMultiplier,
      startSupplyTokens: START_SUPPLY_TOKENS[r.canonicalAssetId] ?? 1n,
    }));
  const skipped = registry.filter((r) => !config.representations[r.id]).map((r) => r.id);
  return { reps, skipped, feed: new SimulatedPriceFeed(config) };
}

/** Writes everything in `[fromMs, toMs)` and rebuilds the market tables over the same range. */
export async function simulateWindow(db: Db, fromMs: number, toMs: number): Promise<WindowResult> {
  const { reps, skipped, feed } = await loadSimulation(db);
  const { prices, navs } = await writePrices(db, feed, reps, fromMs, toMs);
  const supply = await writeSupply(db, reps, fromMs, toMs);
  const trades = await writeTrades(db, reps, fromMs, toMs);
  await rebuildMarket(db, fromMs, toMs);
  return { prices, navs, supply, trades, skipped };
}

/** Writes `days` days of history ending now. Safe to repeat. */
export function backfill(db: Db, nowMs: number, days: number): Promise<WindowResult> {
  return simulateWindow(db, nowMs - days * DAY_MS, nowMs);
}

/** Continues from the newest simulated price; falls back to a 24 hour backfill on an empty database. */
export async function tick(db: Db, nowMs: number): Promise<WindowResult> {
  const [latest] = await db
    .select({ ts: max(pricePoints.ts) })
    .from(pricePoints)
    .where(and(eq(pricePoints.simulated, true)));
  const from = latest?.ts ? latest.ts.getTime() + 1 : nowMs - DAY_MS;
  return simulateWindow(db, from, nowMs);
}
