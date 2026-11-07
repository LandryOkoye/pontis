import { describe, expect, it } from "vitest";
import {
  AmountError,
  U128_MAX,
  amountToString,
  formatDecimalAmount,
  isAmountString,
  parseAmount,
  parseDecimalAmount,
} from "../src/index.ts";

describe("parseAmount / amountToString", () => {
  it("round-trips canonical strings including u128 max", () => {
    for (const s of ["0", "1", "1000000", U128_MAX.toString()]) {
      expect(amountToString(parseAmount(s))).toBe(s);
    }
  });

  it.each(["", "-1", "01", "1.0", "1e3", " 1", "0x10", "+1", (U128_MAX + 1n).toString()])(
    "rejects %j",
    (s) => {
      expect(isAmountString(s)).toBe(false);
      expect(() => parseAmount(s)).toThrow(AmountError);
    },
  );

  it("refuses to serialise negative or oversized amounts", () => {
    expect(() => amountToString(-1n)).toThrow(AmountError);
    expect(() => amountToString(U128_MAX + 1n)).toThrow(AmountError);
  });
});

describe("parseDecimalAmount", () => {
  it("scales by decimals exactly", () => {
    expect(parseDecimalAmount("1", 6)).toBe(1_000_000n);
    expect(parseDecimalAmount("1.5", 6)).toBe(1_500_000n);
    expect(parseDecimalAmount("0.000001", 6)).toBe(1n);
    expect(parseDecimalAmount("12.34567890", 8)).toBe(1_234_567_890n);
    expect(parseDecimalAmount("7", 0)).toBe(7n);
  });

  it("accepts excess fractional digits only when they are zeros", () => {
    expect(parseDecimalAmount("1.500000000", 6)).toBe(1_500_000n);
    expect(() => parseDecimalAmount("1.0000001", 6)).toThrow(AmountError);
    expect(() => parseDecimalAmount("1.5", 0)).toThrow(AmountError);
  });

  it.each(["", ".5", "5.", "-1", "1e3", "1,000", "00.5", "1.2.3", "abc"])("rejects %j", (s) => {
    expect(() => parseDecimalAmount(s, 6)).toThrow(AmountError);
  });

  it("is exact where a float would not be", () => {
    // 0.1 + 0.2 style inputs and values above 2^53 must not lose precision.
    expect(parseDecimalAmount("9007199254740993", 0)).toBe(9007199254740993n);
    expect(parseDecimalAmount("0.30000000000000004", 17)).toBe(30000000000000004n);
  });

  it("rejects values above u128 and unsupported decimals", () => {
    expect(() => parseDecimalAmount((U128_MAX + 1n).toString(), 0)).toThrow(AmountError);
    expect(() => parseDecimalAmount("1", -1)).toThrow(AmountError);
    expect(() => parseDecimalAmount("1", 39)).toThrow(AmountError);
    expect(() => parseDecimalAmount("1", 1.5)).toThrow(AmountError);
  });
});

describe("formatDecimalAmount", () => {
  it("formats exactly and trims trailing zeros", () => {
    expect(formatDecimalAmount(1_500_000n, 6)).toBe("1.5");
    expect(formatDecimalAmount(1n, 6)).toBe("0.000001");
    expect(formatDecimalAmount(1_000_000n, 6)).toBe("1");
    expect(formatDecimalAmount(0n, 8)).toBe("0");
    expect(formatDecimalAmount(42n, 0)).toBe("42");
  });

  it("is the inverse of parseDecimalAmount", () => {
    for (const decimals of [0, 6, 8, 24, 38]) {
      for (const amount of [0n, 1n, 9n, 10n ** BigInt(decimals), 123456789n, U128_MAX]) {
        expect(parseDecimalAmount(formatDecimalAmount(amount, decimals), decimals)).toBe(amount);
      }
    }
  });
});
