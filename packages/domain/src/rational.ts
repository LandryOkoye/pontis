// Exact rational arithmetic on bigint. A `Rational` is always positive (num > 0, den > 0) and in
// lowest terms, so structural equality (`equals`) is semantic equality. Unit multipliers and
// approved conversion ratios are rationals (brief §6.4, ADR 0001). No floating point.

import { AmountError, U128_MAX } from "./amount.ts";

export interface Rational {
  readonly num: bigint;
  readonly den: bigint;
}

/** Wire form: canonical positive integer strings. */
export interface RationalWire {
  num: string;
  den: string;
}

export class RationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RationalError";
  }
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** Builds a normalised positive rational. Throws `RationalError` unless num > 0 and den > 0. */
export function rational(num: bigint, den: bigint = 1n): Rational {
  if (num <= 0n || den <= 0n) throw new RationalError("rational must have num > 0 and den > 0");
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export function mul(a: Rational, b: Rational): Rational {
  return rational(a.num * b.num, a.den * b.den);
}

export function div(a: Rational, b: Rational): Rational {
  return rational(a.num * b.den, a.den * b.num);
}

export function inverse(a: Rational): Rational {
  return { num: a.den, den: a.num };
}

/** -1, 0 or 1. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function equals(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

/**
 * Conversion ratio from `src` to `dst` given each representation's canonical-unit multiplier per
 * smallest unit: `out_smallest = in_smallest * (src / dst)` (BuildPlan §2.1).
 */
export function ratioBetween(src: Rational, dst: Rational): Rational {
  return div(src, dst);
}

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) throw new AmountError(`${name} must be non-negative`);
}

/** floor(a * b / c) exactly. Requires a, b >= 0 and c > 0. */
export function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  assertNonNegative(a, "a");
  assertNonNegative(b, "b");
  if (c <= 0n) throw new RationalError("divisor must be positive");
  return (a * b) / c;
}

/** ceil(a * b / c) exactly. Requires a, b >= 0 and c > 0. */
export function mulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
  assertNonNegative(a, "a");
  assertNonNegative(b, "b");
  if (c <= 0n) throw new RationalError("divisor must be positive");
  return (a * b + c - 1n) / c;
}

/** floor(amount * ratio). */
export function applyFloor(ratio: Rational, amount: bigint): bigint {
  return mulDivFloor(amount, ratio.num, ratio.den);
}

/** ceil(amount * ratio). */
export function applyCeil(ratio: Rational, amount: bigint): bigint {
  return mulDivCeil(amount, ratio.num, ratio.den);
}

export function rationalToWire(r: Rational): RationalWire {
  return { num: r.num.toString(), den: r.den.toString() };
}

const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;

/** Parses a wire rational (positive integer strings, each within u128) into lowest terms. */
export function rationalFromWire(wire: RationalWire): Rational {
  for (const part of [wire.num, wire.den]) {
    if (!POSITIVE_INTEGER_RE.test(part) || BigInt(part) > U128_MAX) {
      throw new RationalError(`invalid rational component: ${JSON.stringify(part)}`);
    }
  }
  return rational(BigInt(wire.num), BigInt(wire.den));
}
