// Conversion amount math, mirroring contracts/pontis-core/src/math.rs line for line (ADR 0001):
// `gross = floor(in * ratio)`, `fee = ceil(gross * fee_bps / 10_000)`, `net = gross - fee`.
// Every intermediate product must fit u128, as on-chain; otherwise the result is `null` and the
// quote is refused. Pinned by test-vectors/quote-math.json, which the Rust tests also check.

import { U128_MAX, type Rational } from "@pontis/domain";

export const BPS_DENOMINATOR = 10_000n;
/** Hard cap on `protocol_fee_bps` (1%), enforced by the contract. */
export const MAX_FEE_BPS = 100;

export interface Amounts {
  readonly gross: bigint;
  readonly fee: bigint;
  readonly net: bigint;
}

const fitsU128 = (value: bigint): boolean => value >= 0n && value <= U128_MAX;

/** Output of converting `amountIn` at `ratio` with `feeBps`; `null` if any product exceeds u128. */
export function computeAmounts(amountIn: bigint, ratio: Rational, feeBps: number): Amounts | null {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 0xffff) {
    throw new RangeError("feeBps must be an integer in 0..65535");
  }
  if (!fitsU128(amountIn)) return null;
  const product = amountIn * ratio.num;
  if (!fitsU128(product)) return null;
  const gross = product / ratio.den;
  const feeProduct = gross * BigInt(feeBps);
  if (!fitsU128(feeProduct)) return null;
  const fee = (feeProduct + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
  return { gross, fee, net: gross - fee };
}
