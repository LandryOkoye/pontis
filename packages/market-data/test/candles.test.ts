import { parsePrice } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import { buildCandles, valueAt, type PriceIn } from "../src/candles.ts";
import { bucketStart, bucketStarts } from "../src/intervals.ts";
import { rankByMarketCap } from "../src/stats.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const p = (offsetMs: number, price: string): PriceIn => ({
  ts: T0 + offsetMs,
  price: parsePrice(price),
  source: "simulated_feed",
});

describe("buckets", () => {
  it("align to UTC and cover a half-open range", () => {
    expect(bucketStart(T0 + 59_999, "1m")).toBe(T0);
    expect(bucketStart(T0 + 61 * MIN, "1h")).toBe(T0 + 60 * MIN);
    expect(bucketStarts(T0, T0 + 3 * MIN, "1m")).toEqual([T0, T0 + MIN, T0 + 2 * MIN]);
    // A range that starts mid-bucket includes that bucket.
    expect(bucketStarts(T0 + 30_000, T0 + MIN + 1, "1m")).toEqual([T0, T0 + MIN]);
  });
});

describe("buildCandles", () => {
  const base = { interval: "1m", from: T0, to: T0 + 4 * MIN, trades: [], decimals: 6 } as const;

  it("takes open, high, low and close from prices in time order, whatever the input order", () => {
    const [c] = buildCandles({
      ...base,
      previousClose: null,
      points: [p(40_000, "11"), p(5_000, "10"), p(20_000, "13"), p(30_000, "9")],
    });
    expect(c).toMatchObject({
      open: parsePrice("10"),
      high: parsePrice("13"),
      low: parsePrice("9"),
      close: parsePrice("11"),
      filled: false,
      sourceMix: ["simulated_feed"],
    });
  });

  it("carries the close forward over gaps and flags those candles filled", () => {
    const out = buildCandles({
      ...base,
      previousClose: null,
      points: [p(0, "10"), p(3 * MIN, "12")],
    });
    expect(out.map((c) => [c.filled, c.close])).toEqual([
      [false, parsePrice("10")],
      [true, parsePrice("10")],
      [true, parsePrice("10")],
      [false, parsePrice("12")],
    ]);
    expect(out[1]).toMatchObject({ open: parsePrice("10"), high: parsePrice("10"), trades: 0 });
  });

  it("builds nothing before the first known price, and uses the previous close when given", () => {
    const points = [p(2 * MIN, "10")];
    expect(
      buildCandles({ ...base, previousClose: null, points }).map((c) => c.bucketStart),
    ).toEqual([T0 + 2 * MIN, T0 + 3 * MIN]);
    const seeded = buildCandles({ ...base, previousClose: parsePrice("9"), points });
    expect(seeded).toHaveLength(4);
    expect(seeded[0]).toMatchObject({ filled: true, close: parsePrice("9") });
  });

  it("sums trade volume per bucket and values it at the close, flooring", () => {
    const [c] = buildCandles({
      ...base,
      previousClose: null,
      points: [p(0, "2.5")],
      trades: [
        { ts: T0 + 1_000, amountIn: 1_500_000n, source: "pontis_trades" },
        { ts: T0 + 2_000, amountIn: 1n, source: "pontis_trades" },
      ],
    });
    // 1_500_001 units at 6 decimals is 1.500001 tokens; times 2.5 is 3.7500025.
    expect(c).toMatchObject({ volumeBase: 1_500_001n, trades: 2, volumeQuote: 375_000_250n });
    expect(valueAt(1n, 6, parsePrice("2.5"))).toBe(250n);
  });

  it("keeps trade volume in a bucket that had no price", () => {
    const out = buildCandles({
      ...base,
      previousClose: parsePrice("4"),
      points: [],
      trades: [{ ts: T0 + MIN + 5, amountIn: 1_000_000n, source: "pontis_trades" }],
    });
    expect(out[1]).toMatchObject({
      filled: true,
      volumeBase: 1_000_000n,
      volumeQuote: parsePrice("4"),
    });
  });
});

describe("rankByMarketCap", () => {
  it("ranks by size, breaks ties by ID and leaves unknown supply unranked", () => {
    const ranks = rankByMarketCap([
      { id: "b", marketCap: 100n },
      { id: "a", marketCap: 100n },
      { id: "c", marketCap: 500n },
      { id: "n", marketCap: null },
    ]);
    expect([...ranks]).toEqual([
      ["b", 3],
      ["a", 2],
      ["c", 1],
      ["n", null],
    ]);
  });
});
