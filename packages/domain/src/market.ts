// Market data vocabulary shared by the database, the market-data package, the API and the
// simulator (ADR 0015). Prices are decimal strings at 8 decimals and bigint inside the code.

import { formatDecimalAmount, parseDecimalAmount } from "./amount.ts";

/** Where a market row came from. `simulated_feed` is always `simulated: true`; `pontis_trades` never is. */
export const DATA_SOURCES = ["pontis_trades", "simulated_feed"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

/** Which rows a read uses: real only, simulated only, or real where it exists and simulated otherwise. */
export const DATA_FILTERS = ["real", "simulated", "all"] as const;
export type DataFilter = (typeof DATA_FILTERS)[number];

export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export const INTERVAL_MS: Readonly<Record<CandleInterval, number>> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** Decimal places of every stored price. */
export const PRICE_DECIMALS = 8;
export const PRICE_SCALE = 10n ** BigInt(PRICE_DECIMALS);

/** `"123.45"` to `12345000000n`. Throws on more than 8 decimals or a non-numeric string. */
export function parsePrice(value: string): bigint {
  return parseDecimalAmount(value, PRICE_DECIMALS);
}

/** `12345000000n` to `"123.45"`. Trailing zeros are trimmed. */
export function formatPrice(price: bigint): string {
  return formatDecimalAmount(price, PRICE_DECIMALS);
}

/** Whether a data source is a simulation. The only place the pairing is decided. */
export function isSimulatedSource(source: DataSource): boolean {
  return source === "simulated_feed";
}

/**
 * Change from `from` to `to` in basis points, truncated toward zero. Null when `from` is not
 * positive, because a change from nothing is undefined, not zero.
 */
export function changeBps(from: bigint, to: bigint): number | null {
  if (from <= 0n) return null;
  return Number(((to - from) * 10_000n) / from);
}
