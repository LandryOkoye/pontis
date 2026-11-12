// Candle builder job (ADR 0015 section 4): reads price points and trades, writes candles.
// Idempotent (an upsert per bucket) and backfillable (any range can be rebuilt).

import { assetRepresentations, pricePoints, trades, type Db } from "@pontis/db";
import {
  CANDLE_INTERVALS,
  formatPrice,
  parsePrice,
  type CandleInterval,
  type DataSource,
} from "@pontis/domain";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { buildCandles, type CandleOut, type PriceIn, type TradeIn } from "./candles.ts";
import { bulkInsert, type BulkColumn } from "./bulk.ts";
import { mapLimit } from "./concurrency.ts";
import { bucketStart } from "./intervals.ts";

export interface RebuildOptions {
  from: Date;
  to: Date;
  /** Default: every representation in the registry mirror. IDs missing from it are skipped. */
  representationIds?: readonly string[];
  intervals?: readonly CandleInterval[];
}

export interface RebuildResult {
  /** Candle rows written (inserted or updated). */
  candles: number;
}

/** 12 columns a row, so this stays well under Postgres' 65,535 bind parameters per statement. */
const BATCH = 4000;
/** Representations rebuilt at once; each uses one connection at a time, the pool holds ten. */
const CONCURRENCY = 4;

/** Rebuilds every bucket overlapping `[from, to)` for each representation and data class. */
export async function rebuildCandles(db: Db, options: RebuildOptions): Promise<RebuildResult> {
  const intervals = options.intervals ?? CANDLE_INTERVALS;
  const reps = await db
    .select({ id: assetRepresentations.id, decimals: assetRepresentations.decimals })
    .from(assetRepresentations)
    .where(
      options.representationIds
        ? inArray(assetRepresentations.id, [...options.representationIds])
        : undefined,
    );
  // Widest alignment, so one read covers every interval's window.
  const loadFrom = new Date(
    Math.min(...intervals.map((i) => bucketStart(options.from.getTime(), i))),
  );
  const counts = await mapLimit(reps, CONCURRENCY, async (rep) => {
    let written = 0;
    for (const simulated of [false, true]) {
      written += await rebuildClass(db, rep, simulated, options, intervals, loadFrom);
    }
    return written;
  });
  return { candles: counts.reduce((sum, n) => sum + n, 0) };
}

/** One representation, one data class. Reads only the columns the builder needs. */
async function rebuildClass(
  db: Db,
  rep: { id: string; decimals: number },
  simulated: boolean,
  options: RebuildOptions,
  intervals: readonly CandleInterval[],
  loadFrom: Date,
): Promise<number> {
  const priceOfClass = and(
    eq(pricePoints.representationId, rep.id),
    eq(pricePoints.simulated, simulated),
  );
  const pointRows = await db
    .select({ ts: pricePoints.ts, price: pricePoints.price, source: pricePoints.source })
    .from(pricePoints)
    .where(and(priceOfClass, gte(pricePoints.ts, loadFrom), lt(pricePoints.ts, options.to)));
  const [prior] = await db
    .select({ price: pricePoints.price })
    .from(pricePoints)
    .where(and(priceOfClass, lt(pricePoints.ts, loadFrom)))
    .orderBy(desc(pricePoints.ts))
    .limit(1);
  const tradeRows = await db
    .select({ ts: trades.ts, amountIn: trades.amountIn, source: trades.source })
    .from(trades)
    .where(
      and(
        eq(trades.fromId, rep.id),
        eq(trades.simulated, simulated),
        gte(trades.ts, loadFrom),
        lt(trades.ts, options.to),
      ),
    );
  if (pointRows.length === 0 && !prior) return 0;
  const points: PriceIn[] = pointRows.map((r) => ({
    ts: r.ts.getTime(),
    price: parsePrice(r.price),
    source: r.source,
  }));
  const tradeIn: TradeIn[] = tradeRows.map((r) => ({
    ts: r.ts.getTime(),
    amountIn: BigInt(r.amountIn),
    source: r.source,
  }));
  let written = 0;
  for (const interval of intervals) {
    const from = bucketStart(options.from.getTime(), interval);
    const before = points.filter((p) => p.ts < from).sort((a, b) => b.ts - a.ts)[0];
    const built = buildCandles({
      interval,
      from,
      to: options.to.getTime(),
      points: points.filter((p) => p.ts >= from),
      trades: tradeIn.filter((t) => t.ts >= from),
      previousClose: before ? before.price : prior ? parsePrice(prior.price) : null,
      decimals: rep.decimals,
    });
    written += await upsert(db, rep.id, interval, simulated, built);
  }
  return written;
}

/** The candle table's columns, in the order `bulkInsert` writes them. */
const CANDLE_COLUMNS: readonly BulkColumn[] = [
  { name: "representation_id", type: "text" },
  { name: "interval", type: "text" },
  { name: "bucket_start", type: "timestamptz" },
  { name: "simulated", type: "boolean" },
  { name: "open", type: "numeric" },
  { name: "high", type: "numeric" },
  { name: "low", type: "numeric" },
  { name: "close", type: "numeric" },
  { name: "volume_base", type: "numeric" },
  { name: "volume_quote", type: "numeric" },
  { name: "trades", type: "integer" },
  { name: "filled", type: "boolean" },
  { name: "source_mix", type: "jsonb" },
];

async function upsert(
  db: Db,
  representationId: string,
  interval: CandleInterval,
  simulated: boolean,
  rows: readonly CandleOut[],
): Promise<number> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((c) => ({
      representation_id: representationId,
      interval,
      bucket_start: new Date(c.bucketStart),
      simulated,
      open: formatPrice(c.open),
      high: formatPrice(c.high),
      low: formatPrice(c.low),
      close: formatPrice(c.close),
      volume_base: c.volumeBase.toString(),
      volume_quote: formatPrice(c.volumeQuote),
      trades: c.trades,
      filled: c.filled,
      source_mix: c.sourceMix as DataSource[],
    }));
    await bulkInsert(db, "candles", CANDLE_COLUMNS, values, CONFLICT_CLAUSE);
  }
  return rows.length;
}

/** An upsert per bucket: a rebuilt candle replaces the stored one. */
const CONFLICT_CLAUSE = sql`ON CONFLICT (representation_id, interval, bucket_start, simulated) DO UPDATE SET open = excluded.open, high = excluded.high, low = excluded.low, close = excluded.close, volume_base = excluded.volume_base, volume_quote = excluded.volume_quote, trades = excluded.trades, filled = excluded.filled, source_mix = excluded.source_mix`;
