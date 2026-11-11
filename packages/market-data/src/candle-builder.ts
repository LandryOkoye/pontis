// Candle builder job (ADR 0015 section 4): reads price points and trades, writes candles.
// Idempotent (an upsert per bucket) and backfillable (any range can be rebuilt).

import { assetRepresentations, candles, pricePoints, trades, type Db } from "@pontis/db";
import {
  CANDLE_INTERVALS,
  formatPrice,
  parsePrice,
  type CandleInterval,
  type DataSource,
} from "@pontis/domain";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { buildCandles, type CandleOut, type PriceIn, type TradeIn } from "./candles.ts";
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

const BATCH = 1000;

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
  const toMs = options.to.getTime();
  // Widest alignment, so one read covers every interval's window.
  const loadFrom = new Date(
    Math.min(...intervals.map((i) => bucketStart(options.from.getTime(), i))),
  );
  let written = 0;
  for (const rep of reps) {
    for (const simulated of [false, true]) {
      const ofClass = (table: typeof pricePoints | typeof trades) =>
        and(
          eq(table === pricePoints ? pricePoints.representationId : trades.fromId, rep.id),
          eq(table.simulated, simulated),
        );
      const inWindow = and(gte(pricePoints.ts, loadFrom), lt(pricePoints.ts, options.to));
      const pointRows = await db
        .select()
        .from(pricePoints)
        .where(and(ofClass(pricePoints), inWindow));
      const [prior] = await db
        .select()
        .from(pricePoints)
        .where(and(ofClass(pricePoints), lt(pricePoints.ts, loadFrom)))
        .orderBy(desc(pricePoints.ts))
        .limit(1);
      const tradeRows = await db
        .select()
        .from(trades)
        .where(and(ofClass(trades), gte(trades.ts, loadFrom), lt(trades.ts, options.to)));
      if (pointRows.length === 0 && !prior) continue;
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
      for (const interval of intervals) {
        const from = bucketStart(options.from.getTime(), interval);
        const before = points.filter((p) => p.ts < from).sort((a, b) => b.ts - a.ts)[0];
        const built = buildCandles({
          interval,
          from,
          to: toMs,
          points: points.filter((p) => p.ts >= from),
          trades: tradeIn.filter((t) => t.ts >= from),
          previousClose: before ? before.price : prior ? parsePrice(prior.price) : null,
          decimals: rep.decimals,
        });
        written += await upsert(db, rep.id, interval, simulated, built);
      }
    }
  }
  return { candles: written };
}

async function upsert(
  db: Db,
  representationId: string,
  interval: CandleInterval,
  simulated: boolean,
  rows: readonly CandleOut[],
): Promise<number> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((c) => ({
      representationId,
      interval,
      simulated,
      bucketStart: new Date(c.bucketStart),
      open: formatPrice(c.open),
      high: formatPrice(c.high),
      low: formatPrice(c.low),
      close: formatPrice(c.close),
      volumeBase: c.volumeBase.toString(),
      volumeQuote: formatPrice(c.volumeQuote),
      trades: c.trades,
      filled: c.filled,
      sourceMix: c.sourceMix as DataSource[],
    }));
    await db
      .insert(candles)
      .values(values)
      .onConflictDoUpdate({
        target: [
          candles.representationId,
          candles.interval,
          candles.bucketStart,
          candles.simulated,
        ],
        set: CONFLICT_UPDATE,
      });
  }
  return rows.length;
}

/** The value the insert would have written, for `ON CONFLICT DO UPDATE`. */
const sqlExcluded = (column: string) => sql.raw(`excluded."${column}"`);
const CONFLICT_UPDATE = Object.fromEntries(
  (
    [
      "open",
      "high",
      "low",
      "close",
      "volumeBase",
      "volumeQuote",
      "trades",
      "filled",
      "sourceMix",
    ] as const
  ).map((key) => [key, sqlExcluded(key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`))]),
);
