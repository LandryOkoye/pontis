// Number formatting for market data. These are display-only floats for synthetic USD figures;
// token amounts elsewhere stay bigint (see format.ts).
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PLAIN_COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** A figure the API does not have renders as a dash, never as zero. */
const orDash =
  (format: (n: number) => string) =>
  (n: number | null | undefined): string =>
    n === null || n === undefined ? "—" : format(n);

export const usd = orDash((n) => USD.format(n));
export const usdCompact = orDash((n) => COMPACT.format(n));
export const compact = orDash((n) => PLAIN_COMPACT.format(n));
export const integer = (n: number): string => INT.format(n);

/** "+1.23%" / "-0.40%" from a fraction. */
export function pct(fraction: number, digits = 2): string {
  const v = fraction * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}
export const trendTone = (fraction: number): "up" | "down" => (fraction >= 0 ? "up" : "down");
