// Pure candle aggregation (ADR 0015 section 4). No I/O, bigint only.

import { type CandleInterval, type DataSource } from "@pontis/domain";
import { bucketStart, bucketStarts } from "./intervals.ts";

export interface PriceIn {
  ts: number;
  /** Price at 8 decimals. */
  price: bigint;
  source: DataSource;
}

export interface TradeIn {
  ts: number;
  /** Smallest units of the representation sold into the pair. */
  amountIn: bigint;
  source: DataSource;
}

export interface CandleOut {
  bucketStart: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volumeBase: bigint;
  /** `volumeBase` valued at `close`, at 8 decimals. */
  volumeQuote: bigint;
  trades: number;
  filled: boolean;
  sourceMix: DataSource[];
}

export interface BuildCandlesInput {
  interval: CandleInterval;
  /** Half-open range `[from, to)` in epoch ms; every bucket that overlaps it is built. */
  from: number;
  to: number;
  /** Prices of one data class (real or simulated), any order. */
  points: readonly PriceIn[];
  trades: readonly TradeIn[];
  /** Close of the last bucket before `from`, carried into empty leading buckets. Null if none. */
  previousClose: bigint | null;
  decimals: number;
}

/** Value of `amount` smallest units at `price` (8 decimals), floored, at 8 decimals. */
export function valueAt(amount: bigint, decimals: number, price: bigint): bigint {
  return (amount * price) / 10n ** BigInt(decimals);
}

/**
 * One candle per bucket from the first price onward. A bucket with prices takes open, high, low
 * and close from them in time order. A bucket without any repeats the previous close with
 * `filled = true`. Buckets before the first known price do not exist. Volume is whatever traded
 * in the bucket, so a filled candle can still carry volume.
 */
export function buildCandles(input: BuildCandlesInput): CandleOut[] {
  const { interval, points, trades, decimals } = input;
  const byBucket = new Map<number, { points: PriceIn[]; trades: TradeIn[] }>();
  const slot = (start: number) => {
    let entry = byBucket.get(start);
    if (!entry) byBucket.set(start, (entry = { points: [], trades: [] }));
    return entry;
  };
  for (const p of points) slot(bucketStart(p.ts, interval)).points.push(p);
  for (const t of trades) slot(bucketStart(t.ts, interval)).trades.push(t);

  const out: CandleOut[] = [];
  let carry = input.previousClose;
  for (const start of bucketStarts(input.from, input.to, interval)) {
    const entry = byBucket.get(start);
    const ordered = [...(entry?.points ?? [])].sort((a, b) => a.ts - b.ts);
    const traded = entry?.trades ?? [];
    let candle: CandleOut | undefined;
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first && last) {
      candle = {
        bucketStart: start,
        open: first.price,
        high: ordered.reduce((m, p) => (p.price > m ? p.price : m), first.price),
        low: ordered.reduce((m, p) => (p.price < m ? p.price : m), first.price),
        close: last.price,
        volumeBase: 0n,
        volumeQuote: 0n,
        trades: 0,
        filled: false,
        sourceMix: [...new Set(ordered.map((p) => p.source))].sort(),
      };
    } else if (carry !== null) {
      candle = {
        bucketStart: start,
        open: carry,
        high: carry,
        low: carry,
        close: carry,
        volumeBase: 0n,
        volumeQuote: 0n,
        trades: 0,
        filled: true,
        sourceMix: [],
      };
    }
    if (!candle) continue;
    const volumeBase = traded.reduce((sum, t) => sum + t.amountIn, 0n);
    candle.volumeBase = volumeBase;
    candle.volumeQuote = valueAt(volumeBase, decimals, candle.close);
    candle.trades = traded.length;
    out.push(candle);
    carry = candle.close;
  }
  return out;
}
