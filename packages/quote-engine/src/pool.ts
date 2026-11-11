// Oracle-anchored market-pool math for Phase 5 (ADR 0020). The oracle price is quote smallest
// units per base smallest unit. This module is intentionally pure: callers must separately
// establish oracle freshness, route eligibility, pool caps and the signed quote lifecycle.
//
// The impact curve is `out_before_fee = mid_out * depth / (depth + input_value)`, where depth is
// the smaller of the output reserve and the input reserve marked at the oracle price. It keeps the
// oracle as the mid price while making a trade progressively worse as it consumes finite depth.

import { type Rational, U128_MAX } from "@pontis/domain";
import { BPS_DENOMINATOR } from "./math.ts";

/** Upper bound for an LP-configured market-pool fee (10%). */
export const MAX_POOL_FEE_BPS = 1_000;

export interface MarketPoolQuoteInput {
  /** Positive base-token amount in smallest units. */
  readonly amountIn: bigint;
  /** Quote-token smallest units per base-token smallest unit. */
  readonly oraclePrice: Rational;
  readonly reserveIn: bigint;
  readonly reserveOut: bigint;
  readonly feeBps: number;
}

export interface MarketPoolQuote {
  /** Oracle-only output, before depth impact or fees. */
  readonly midAmountOut: bigint;
  /** Input valued in quote-token smallest units at the oracle price. */
  readonly inputValue: bigint;
  /** Conservative quote-denominated liquidity depth used by the impact curve. */
  readonly depth: bigint;
  /** Output after depth impact and before fee. */
  readonly amountOutBeforeFee: bigint;
  readonly fee: bigint;
  readonly amountOut: bigint;
  /** The impact of the depth curve, rounded against the trader. */
  readonly priceImpactBps: bigint;
}

const fitsU128 = (value: bigint): boolean => value >= 0n && value <= U128_MAX;

function checkedMulDivFloor(a: bigint, b: bigint, denominator: bigint): bigint | null {
  if (!fitsU128(a) || !fitsU128(b) || denominator <= 0n) return null;
  const product = a * b;
  if (!fitsU128(product)) return null;
  return product / denominator;
}

function checkedMulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint | null {
  const floor = checkedMulDivFloor(a, b, denominator);
  if (floor === null) return null;
  const product = a * b;
  return product % denominator === 0n ? floor : floor + 1n;
}

function validBps(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}

/**
 * Quotes a market-priced pool swap using the Phase 5 oracle-anchored depth curve.
 *
 * Returns `null` for an empty/unquotable pool or when a calculation would exceed the contract's
 * u128 arithmetic. Invalid configuration throws so it cannot silently become a no-quote result.
 */
export function quoteMarketPool(input: MarketPoolQuoteInput): MarketPoolQuote | null {
  if (!validBps(input.feeBps, MAX_POOL_FEE_BPS)) {
    throw new RangeError(`feeBps must be an integer in 0..${MAX_POOL_FEE_BPS}`);
  }
  if (!fitsU128(input.amountIn) || !fitsU128(input.reserveIn) || !fitsU128(input.reserveOut)) {
    return null;
  }
  if (input.amountIn === 0n || input.reserveIn === 0n || input.reserveOut === 0n) return null;

  const inputValue = checkedMulDivFloor(input.amountIn, input.oraclePrice.num, input.oraclePrice.den);
  const markedInputReserve = checkedMulDivFloor(
    input.reserveIn,
    input.oraclePrice.num,
    input.oraclePrice.den,
  );
  if (inputValue === null || markedInputReserve === null || inputValue === 0n) return null;

  const depth = markedInputReserve < input.reserveOut ? markedInputReserve : input.reserveOut;
  const denominator = depth + inputValue;
  if (depth === 0n || !fitsU128(denominator)) return null;

  const midAmountOut = inputValue;
  const amountOutBeforeFee = checkedMulDivFloor(midAmountOut, depth, denominator);
  const fee = checkedMulDivCeil(
    amountOutBeforeFee ?? -1n,
    BigInt(input.feeBps),
    BPS_DENOMINATOR,
  );
  const priceImpactBps = checkedMulDivCeil(inputValue, BPS_DENOMINATOR, denominator);
  if (
    amountOutBeforeFee === null ||
    fee === null ||
    priceImpactBps === null ||
    fee > amountOutBeforeFee
  ) {
    return null;
  }

  return {
    midAmountOut,
    inputValue,
    depth,
    amountOutBeforeFee,
    fee,
    amountOut: amountOutBeforeFee - fee,
    priceImpactBps,
  };
}

/** Minimum acceptable output for a user-selected slippage tolerance, rounded against the trader. */
export function minimumAmountOut(amountOut: bigint, maxSlippageBps: number): bigint {
  if (!fitsU128(amountOut)) throw new RangeError("amountOut must be a u128");
  if (!validBps(maxSlippageBps, Number(BPS_DENOMINATOR))) {
    throw new RangeError("maxSlippageBps must be an integer in 0..10000");
  }
  return (amountOut * (BPS_DENOMINATOR - BigInt(maxSlippageBps))) / BPS_DENOMINATOR;
}
