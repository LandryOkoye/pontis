import { describe, expect, it } from "vitest";
import {
  CANDLE_INTERVALS,
  INTERVAL_MS,
  changeBps,
  formatPrice,
  isSimulatedSource,
  parsePrice,
} from "../src/index.ts";

describe("prices", () => {
  it("round-trips at eight decimals without floating point", () => {
    expect(parsePrice("123.45")).toBe(12_345_000_000n);
    expect(formatPrice(12_345_000_000n)).toBe("123.45");
    expect(formatPrice(parsePrice("0.00000001"))).toBe("0.00000001");
    expect(formatPrice(parsePrice("1"))).toBe("1");
  });

  it("rejects more than eight decimals and non-numeric text", () => {
    expect(() => parsePrice("1.000000001")).toThrow();
    expect(() => parsePrice("1e3")).toThrow();
    expect(() => parsePrice("-1")).toThrow();
  });
});

describe("changeBps", () => {
  it("truncates toward zero and handles both directions", () => {
    expect(changeBps(parsePrice("100"), parsePrice("101.239"))).toBe(123);
    expect(changeBps(parsePrice("100"), parsePrice("98.5"))).toBe(-150);
    expect(changeBps(parsePrice("100"), parsePrice("99.999"))).toBe(0);
  });

  it("is undefined, not zero, when there is no starting price", () => {
    expect(changeBps(0n, parsePrice("5"))).toBeNull();
  });
});

describe("intervals and sources", () => {
  it("lists every interval with a length that divides a day", () => {
    for (const interval of CANDLE_INTERVALS) {
      expect(86_400_000 % INTERVAL_MS[interval]).toBe(0);
    }
  });

  it("only the simulated feed is a simulation", () => {
    expect(isSimulatedSource("simulated_feed")).toBe(true);
    expect(isSimulatedSource("pontis_trades")).toBe(false);
  });
});
