// Shared pieces of the metric query modules: windows, the context, and the number formats.
// Rates and latencies are formatted from integers; no float touches a rate.

import type { MetricValue, MetricWindow } from "@pontis/api-types";
import { METRIC_WINDOWS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import { and, gte, lte, type AnyColumn, type SQL } from "drizzle-orm";

export interface MetricsContext {
  db: Db;
  /** The `asOf` instant; windows roll back from it. */
  now: Date;
  /** Whether any quote involves a synthetic representation; the `simulated` flag of every trading metric. */
  tradingSynthetic: boolean;
}

export type Windowed<T> = Record<MetricWindow, T>;

/** A computed metric: the catalogue adds key, unit, scope and note. */
export interface Computed {
  values?: Windowed<MetricValue>;
  value?: MetricValue;
  simulated: boolean;
}

/** A per-representation amount metric (admin only). */
export interface ComputedBreakdown {
  values?: Windowed<Record<string, string>>;
  value?: Record<string, string>;
  simulated: boolean;
}

const WINDOW_MS: Record<MetricWindow, number | null> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  all: null,
};

/** `column` lies in the rolling window ending at `now` (inclusive at both ends). */
export function inWindow(column: AnyColumn, window: MetricWindow, now: Date): SQL {
  const ms = WINDOW_MS[window];
  const upper = lte(column, now);
  return (ms === null ? upper : and(gte(column, new Date(now.getTime() - ms)), upper)) as SQL;
}

/** Runs `compute` once per window. */
export async function perWindow<T>(
  compute: (window: MetricWindow) => Promise<T>,
): Promise<Windowed<T>> {
  const entries = await Promise.all(
    METRIC_WINDOWS.map(async (w) => [w, await compute(w)] as const),
  );
  return Object.fromEntries(entries) as Windowed<T>;
}

/** `num / den` at `places` decimals, half up, from integers; null when `den` is 0. */
export function decimalRatio(num: bigint, den: bigint, places: number): string | null {
  if (den === 0n) return null;
  const scale = 10n ** BigInt(places);
  const scaled = (2n * num * scale + den) / (2n * den);
  return formatScaled(scaled, places);
}

/** An integer count of `1/10^places` units as a decimal string. */
export function formatScaled(scaled: bigint, places: number): string {
  const scale = 10n ** BigInt(places);
  return `${scaled / scale}.${(scaled % scale).toString().padStart(places, "0")}`;
}

/** A share from 0 to 1 at 6 places. */
export const ratio6 = (num: bigint, den: bigint): string | null => decimalRatio(num, den, 6);

/** A share from 0 to 100 at 6 places. */
export const percent6 = (num: bigint, den: bigint): string | null =>
  decimalRatio(num * 100n, den, 6);

/** Milliseconds as seconds at 3 places. */
export const secondsFromMs = (ms: number): string => formatScaled(BigInt(Math.round(ms)), 3);

/** A bigint count read back from a `count(*)::text` column. */
export const big = (text: string | null | undefined): bigint => BigInt(text ?? "0");
