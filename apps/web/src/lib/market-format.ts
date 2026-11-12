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

export const usd = (n: number): string => USD.format(n);
export const usdCompact = (n: number): string => COMPACT.format(n);
export const compact = (n: number): string => PLAIN_COMPACT.format(n);
export const integer = (n: number): string => INT.format(n);

/** "+1.23%" / "-0.40%" from a fraction. */
export function pct(fraction: number, digits = 2): string {
  const v = fraction * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}
export const trendTone = (fraction: number): "up" | "down" => (fraction >= 0 ? "up" : "down");
