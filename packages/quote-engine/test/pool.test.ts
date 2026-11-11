import { readFileSync } from "node:fs";
import { rational } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import {
  MAX_POOL_FEE_BPS,
  minimumAmountOut,
  quoteMarketPool,
  type MarketPoolQuoteInput,
} from "../src/pool.ts";

interface Vector {
  name: string;
  input: {
    amount_in: string;
    oracle_price: { num: string; den: string };
    reserve_in: string;
    reserve_out: string;
    fee_bps: number;
  };
  expected: Record<string, string> | null;
}

const vectors = JSON.parse(
  readFileSync(new URL("../../../test-vectors/market-pool-math.json", import.meta.url), "utf8"),
) as { cases: Vector[] };

function quote(input: Vector["input"]) {
  return quoteMarketPool({
    amountIn: BigInt(input.amount_in),
    oraclePrice: rational(BigInt(input.oracle_price.num), BigInt(input.oracle_price.den)),
    reserveIn: BigInt(input.reserve_in),
    reserveOut: BigInt(input.reserve_out),
    feeBps: input.fee_bps,
  });
}

describe("quoteMarketPool shared vectors", () => {
  it.each(vectors.cases)("$name", (vector) => {
    const got = quote(vector.input);
    const expected = vector.expected
      ? Object.fromEntries(Object.entries(vector.expected).map(([key, value]) => [key, BigInt(value)]))
      : null;
    expect(got).toEqual(expected);
  });
});

describe("quoteMarketPool properties", () => {
  const pool: Omit<MarketPoolQuoteInput, "amountIn"> = {
    oraclePrice: rational(2n),
    reserveIn: 5_000_000n,
    reserveOut: 10_000_000n,
    feeBps: 30,
  };

  it("never pays more than oracle mid, before or after fees", () => {
    for (let amountIn = 1n; amountIn < 100_000n; amountIn += 997n) {
      const result = quoteMarketPool({ ...pool, amountIn });
      expect(result).not.toBeNull();
      expect(result!.amountOut <= result!.amountOutBeforeFee).toBe(true);
      expect(result!.amountOutBeforeFee <= result!.midAmountOut).toBe(true);
      expect(result!.amountOutBeforeFee < pool.reserveOut).toBe(true);
      expect(result!.priceImpactBps).toBeGreaterThan(0n);
    }
  });

  it("makes larger trades weakly worse per unit and more impactful", () => {
    const small = quoteMarketPool({ ...pool, amountIn: 1_000n })!;
    const large = quoteMarketPool({ ...pool, amountIn: 100_000n })!;
    expect(small.amountOut * 100_000n >= large.amountOut * 1_000n).toBe(true);
    expect(large.priceImpactBps >= small.priceImpactBps).toBe(true);
  });

  it("rejects empty pools and u128-overflow paths", () => {
    expect(quoteMarketPool({ ...pool, amountIn: 0n })).toBeNull();
    expect(quoteMarketPool({ ...pool, reserveOut: 0n, amountIn: 1n })).toBeNull();
    expect(quoteMarketPool({ ...pool, amountIn: 2n ** 127n })).toBeNull();
    expect(() => quoteMarketPool({ ...pool, amountIn: 1n, feeBps: MAX_POOL_FEE_BPS + 1 })).toThrow(
      RangeError,
    );
  });
});

describe("minimumAmountOut", () => {
  it("rounds the slippage bound down and validates its inputs", () => {
    expect(minimumAmountOut(1_001n, 100)).toBe(990n);
    expect(minimumAmountOut(1_001n, 10_000)).toBe(0n);
    expect(() => minimumAmountOut(1n, 10_001)).toThrow(RangeError);
    expect(() => minimumAmountOut(-1n, 0)).toThrow(RangeError);
  });
});
