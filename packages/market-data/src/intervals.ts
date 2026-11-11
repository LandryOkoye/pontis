// UTC-aligned candle buckets. All times are epoch milliseconds.

import { INTERVAL_MS, type CandleInterval } from "@pontis/domain";

/** Start of the bucket that contains `ms`. */
export function bucketStart(ms: number, interval: CandleInterval): number {
  const size = INTERVAL_MS[interval];
  return ms - (((ms % size) + size) % size);
}

/** Starts of every bucket that overlaps the half-open range `[fromMs, toMs)`, ascending. */
export function bucketStarts(fromMs: number, toMs: number, interval: CandleInterval): number[] {
  const size = INTERVAL_MS[interval];
  const starts: number[] = [];
  for (let t = bucketStart(fromMs, interval); t < toMs; t += size) starts.push(t);
  return starts;
}
