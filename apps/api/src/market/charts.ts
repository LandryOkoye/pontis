// Chart reads (brief section 12.4). A chart is a window of buckets; each point says whether it is
// simulated, and the envelope says whether any is (ADR 0015 section 1).

import type { PriceChart, VolumeChart } from "@pontis/api-types";
import { assetRepresentations, candles, type Db } from "@pontis/db";
import { INTERVAL_MS, type CandleInterval, type DataFilter, type DataSource } from "@pontis/domain";
import { bucketStart } from "@pontis/market-data";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { AppError } from "../errors.ts";
import { priceText } from "./snapshot.ts";

const MAX_BUCKETS = 5_000;
const DEFAULT_BUCKETS = 500;

export interface ChartRange {
  interval: CandleInterval;
  fromMs: number;
  toMs: number;
}

export interface ChartInput {
  interval: CandleInterval;
  from?: string | undefined;
  to?: string | undefined;
  data: DataFilter;
}

/** Defaults, ordering and the size limit. `to` defaults to now and `from` to 500 buckets before it. */
export function resolveRange(input: ChartInput, now: Date): ChartRange {
  const size = INTERVAL_MS[input.interval];
  const toMs = input.to ? Date.parse(input.to) : now.getTime();
  const fromMs = input.from ? Date.parse(input.from) : toMs - DEFAULT_BUCKETS * size;
  if (fromMs >= toMs) throw new AppError("VALIDATION_ERROR", 400, "`from` must be before `to`");
  const buckets = Math.ceil((toMs - bucketStart(fromMs, input.interval)) / size);
  if (buckets > MAX_BUCKETS) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `range spans ${buckets} buckets; at most ${MAX_BUCKETS} are served, use a larger interval or a shorter range`,
    );
  }
  return { interval: input.interval, fromMs: bucketStart(fromMs, input.interval), toMs };
}

const sourceOf = (simulated: boolean): DataSource =>
  simulated ? "simulated_feed" : "pontis_trades";

export function envelope(
  representationId: string,
  range: ChartRange,
  flags: { simulated: boolean }[],
) {
  const sources = [...new Set(flags.map((f) => sourceOf(f.simulated)))].sort();
  return {
    representationId,
    interval: range.interval,
    from: new Date(range.fromMs).toISOString(),
    to: new Date(range.toMs).toISOString(),
    source: sources,
    simulated: flags.some((f) => f.simulated),
  };
}

export async function representationExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: assetRepresentations.id })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.id, id));
  return row !== undefined;
}

type CandleRow = typeof candles.$inferSelect;

/** One candle per bucket: real where it exists, simulated otherwise (`all`), or one class only. */
async function candleRows(db: Db, id: string, range: ChartRange, filter: DataFilter) {
  const rows = await db
    .select()
    .from(candles)
    .where(
      and(
        eq(candles.representationId, id),
        eq(candles.interval, range.interval),
        gte(candles.bucketStart, new Date(range.fromMs)),
        lt(candles.bucketStart, new Date(range.toMs)),
      ),
    )
    .orderBy(asc(candles.bucketStart));
  const byBucket = new Map<number, CandleRow>();
  for (const row of rows) {
    if (filter === "real" && row.simulated) continue;
    if (filter === "simulated" && !row.simulated) continue;
    const key = row.bucketStart.getTime();
    const held = byBucket.get(key);
    if (!held || (held.simulated && !row.simulated)) byBucket.set(key, row);
  }
  return [...byBucket.values()];
}

export async function priceChart(
  db: Db,
  id: string,
  range: ChartRange,
  filter: DataFilter,
): Promise<PriceChart> {
  const rows = await candleRows(db, id, range, filter);
  return {
    ...envelope(id, range, rows),
    filledPoints: rows.filter((r) => r.filled).length,
    points: rows.map((r) => ({
      t: r.bucketStart.toISOString(),
      simulated: r.simulated,
      open: priceText(r.open),
      high: priceText(r.high),
      low: priceText(r.low),
      close: priceText(r.close),
      volumeBase: r.volumeBase,
      volumeQuote: priceText(r.volumeQuote),
      trades: r.trades,
      filled: r.filled,
    })),
  };
}

export async function volumeChart(
  db: Db,
  id: string,
  range: ChartRange,
  filter: DataFilter,
): Promise<VolumeChart> {
  const rows = await candleRows(db, id, range, filter);
  return {
    ...envelope(id, range, rows),
    filledPoints: rows.filter((r) => r.filled).length,
    points: rows.map((r) => ({
      t: r.bucketStart.toISOString(),
      simulated: r.simulated,
      volumeBase: r.volumeBase,
      volumeQuote: priceText(r.volumeQuote),
      trades: r.trades,
      filled: r.filled,
    })),
  };
}
