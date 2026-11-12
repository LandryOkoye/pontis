// Route guard arithmetic, mirroring contracts/pontis-core/src/guard_math.rs and guard.rs (ADR 0016).
// The contract uses 256-bit intermediates and refuses (`null` here) anything that does not fit;
// JavaScript bigints do not overflow, so the same limit is applied explicitly. Pinned by
// test-vectors/route-guard.json, which the Rust tests also check.

import type { Rational } from "@pontis/domain";
import { computeAmounts } from "./math.ts";

const TWO_256 = 1n << 256n;

/** Prices above this are refused by the contract at submission and by the deviation check. */
export const MAX_PRICE = (1n << 64n) - 1n;
export const MAX_DECIMAL_GAP = 18;
export const MAX_SKEW_BPS = 400;

const fits256 = (v: bigint): boolean => v >= 0n && v < TWO_256;

/**
 * `X = A * den` and `Y = num * B` where the market ratio is `A / B` and the approved ratio is
 * `num / den`, both in output smallest units per input smallest unit. The deviation is
 * `|X - Y| / Y`. `null` when a price is unusable, the decimal gap is too large or a product
 * overflows 256 bits.
 */
export function deviationTerms(
  ratio: Rational,
  priceFrom: bigint,
  priceTo: bigint,
  decimalsFrom: number,
  decimalsTo: number,
): { x: bigint; y: bigint } | null {
  if (priceFrom <= 0n || priceTo <= 0n || priceFrom > MAX_PRICE || priceTo > MAX_PRICE) return null;
  const gap = Math.abs(decimalsFrom - decimalsTo);
  if (gap > MAX_DECIMAL_GAP) return null;
  const scale = 10n ** BigInt(gap);
  const [a, b] =
    decimalsTo >= decimalsFrom ? [priceFrom * scale, priceTo] : [priceFrom, priceTo * scale];
  const x = a * ratio.den;
  const y = b * ratio.num;
  return fits256(x) && fits256(y) ? { x, y } : null;
}

const absDiff = (a: bigint, b: bigint): bigint => (a > b ? a - b : b - a);

/** `|X - Y| * 10000 > maxBps * Y`, or `null` if either side overflows 256 bits. */
export function exceedsDeviation(x: bigint, y: bigint, maxBps: number): boolean | null {
  const lhs = absDiff(x, y) * 10_000n;
  const rhs = y * BigInt(maxBps);
  return fits256(lhs) && fits256(rhs) ? lhs > rhs : null;
}

/** `floor(|X - Y| * 10000 / Y)`, or `null` on overflow. */
export function deviationBps(x: bigint, y: bigint): bigint | null {
  const scaled = absDiff(x, y) * 10_000n;
  return fits256(scaled) && y > 0n ? scaled / y : null;
}

/**
 * Extra fee for a depleted output vault: `ceil(skewMax * depletion^2 / reference^2)` with
 * `depletion = max(0, reference - inventoryAfter)`. Zero without a reference. When the numerator
 * overflows 256 bits the maximum is charged, as on chain.
 */
export function skewBps(skewMaxBps: number, reference: bigint, inventoryAfter: bigint): number {
  const depletion = reference > inventoryAfter ? reference - inventoryAfter : 0n;
  if (reference === 0n || depletion === 0n || skewMaxBps === 0) return 0;
  const numerator = BigInt(skewMaxBps) * depletion * depletion;
  if (!fits256(numerator)) return skewMaxBps;
  const denominator = reference * reference;
  const v = (numerator + denominator - 1n) / denominator;
  return Number(v < BigInt(skewMaxBps) ? v : BigInt(skewMaxBps));
}

export interface FeeInput {
  protocolFeeBps: number;
  /** Added when a stale or missing price is tolerated (`fail_open_with_wider_fee`). */
  extraFeeBps: number;
  skewMaxBps: number;
  /** Peak spendable inventory of the output vault (`get_inventory_reference`). */
  reference: bigint;
  /** Spendable inventory of the output vault (`get_inventory`). */
  inventory: bigint;
  amountIn: bigint;
  ratio: Rational;
}

/**
 * The fee a quote must carry: protocol fee, extra fee and the skew for the vault's depletion after
 * paying out what the base fee would give. The contract recomputes it and refuses a different
 * `fee_bps` (`FEE_CHANGED`).
 */
export function effectiveFeeBps(i: FeeInput): number {
  const base = i.protocolFeeBps + i.extraFeeBps;
  if (i.skewMaxBps === 0) return base;
  const net = computeAmounts(i.amountIn, i.ratio, base)?.net ?? 0n;
  const after = i.inventory > net ? i.inventory - net : 0n;
  return base + skewBps(i.skewMaxBps, i.reference, after);
}

export type LimitVerdict = "ok" | "below_min" | "above_max" | "window_exceeded";

export interface Limits {
  /** 0 means none for each of these. */
  minAmountIn: bigint;
  maxAmountIn: bigint;
  windowMs: number;
  maxWindowAmountIn: bigint;
}

/** Per-transaction and window limits, in the order the contract applies them. */
export function checkLimits(limits: Limits, amountIn: bigint, windowUsed: bigint): LimitVerdict {
  if (limits.minAmountIn > 0n && amountIn < limits.minAmountIn) return "below_min";
  if (limits.maxAmountIn > 0n && amountIn > limits.maxAmountIn) return "above_max";
  if (limits.windowMs > 0 && windowUsed + amountIn > limits.maxWindowAmountIn) {
    return "window_exceeded";
  }
  return "ok";
}
