import { describe, expect, it } from "vitest";
import {
  AmountError,
  RationalError,
  applyCeil,
  applyFloor,
  compare,
  div,
  equals,
  inverse,
  mul,
  mulDivCeil,
  mulDivFloor,
  ratioBetween,
  rational,
  rationalFromWire,
  rationalToWire,
} from "../src/index.ts";

// ADR 0001 / BuildPlan §2.1 multipliers per smallest unit.
const TGOLD_A = rational(1n, 1_000_000n);
const TGOLD_B = rational(1n, 1_000_000_000n);

describe("rational", () => {
  it("normalises to lowest terms so equality is semantic", () => {
    expect(rational(10n, 4n)).toEqual({ num: 5n, den: 2n });
    expect(equals(rational(2n, 6n), rational(1n, 3n))).toBe(true);
  });

  it.each([
    [0n, 1n],
    [1n, 0n],
    [-1n, 2n],
    [1n, -2n],
  ])("rejects non-positive rational %s/%s", (n, d) => {
    expect(() => rational(n, d)).toThrow(RationalError);
  });

  it("does exact arithmetic beyond 2^53", () => {
    const big = rational(2n ** 100n + 1n, 3n);
    expect(equals(div(mul(big, rational(7n, 5n)), rational(7n, 5n)), big)).toBe(true);
    expect(equals(mul(big, inverse(big)), rational(1n))).toBe(true);
  });

  it("orders rationals", () => {
    expect(compare(rational(1n, 3n), rational(1n, 2n))).toBe(-1);
    expect(compare(rational(2n, 4n), rational(1n, 2n))).toBe(0);
    expect(compare(rational(3n, 2n), rational(1n, 1n))).toBe(1);
  });

  it("derives the approved TGOLD ratios: 1 A = 10 B, in smallest units out_B = in_A * 1000", () => {
    const aToB = ratioBetween(TGOLD_A, TGOLD_B);
    expect(aToB).toEqual({ num: 1000n, den: 1n });
    expect(applyFloor(aToB, 1_000_000n)).toBe(1_000_000_000n); // 1 A -> 10 B
    expect(ratioBetween(TGOLD_B, TGOLD_A)).toEqual({ num: 1n, den: 1000n });
  });
});

describe("mulDiv / apply", () => {
  it("floors and ceils exactly", () => {
    expect(mulDivFloor(7n, 3n, 2n)).toBe(10n);
    expect(mulDivCeil(7n, 3n, 2n)).toBe(11n);
    expect(mulDivFloor(6n, 3n, 2n)).toBe(9n);
    expect(mulDivCeil(6n, 3n, 2n)).toBe(9n);
    expect(mulDivCeil(0n, 3n, 2n)).toBe(0n);
  });

  it("rejects negatives and non-positive divisors", () => {
    expect(() => mulDivFloor(-1n, 1n, 1n)).toThrow(AmountError);
    expect(() => mulDivCeil(1n, -1n, 1n)).toThrow(AmountError);
    expect(() => mulDivFloor(1n, 1n, 0n)).toThrow(RationalError);
  });

  it("keeps floor <= exact <= ceil and ceil - floor <= 1 over many inputs", () => {
    // Deterministic LCG so the test is reproducible.
    let seed = 0x2545f491n;
    const next = (): bigint =>
      (seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n);
    for (let i = 0; i < 2000; i++) {
      const ratio = rational((next() % 10_000n) + 1n, (next() % 10_000n) + 1n);
      const amount = next() % 10n ** 24n;
      const lo = applyFloor(ratio, amount);
      const hi = applyCeil(ratio, amount);
      expect(lo * ratio.den).toBeLessThanOrEqual(amount * ratio.num);
      expect(hi * ratio.den).toBeGreaterThanOrEqual(amount * ratio.num);
      expect(hi - lo).toBeLessThanOrEqual(1n);
    }
  });
});

describe("wire form", () => {
  it("round-trips and normalises", () => {
    expect(rationalToWire(rational(1000n, 1n))).toEqual({ num: "1000", den: "1" });
    expect(rationalFromWire({ num: "2000", den: "2" })).toEqual({ num: 1000n, den: 1n });
  });

  it.each([
    { num: "0", den: "1" },
    { num: "1", den: "0" },
    { num: "-1", den: "1" },
    { num: "01", den: "1" },
    { num: "1.5", den: "1" },
    { num: (2n ** 128n).toString(), den: "1" },
  ])("rejects invalid wire rational %j", (wire) => {
    expect(() => rationalFromWire(wire)).toThrow(RationalError);
  });
});
