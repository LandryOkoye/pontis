import { readFileSync } from "node:fs";
import { rational } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import { MAX_FEE_BPS, computeAmounts } from "../src/math.ts";

interface Vector {
  name: string;
  amount_in: string;
  ratio: { num: string; den: string };
  fee_bps: number;
  expected: { gross: string; fee: string; net: string } | null;
}

const vectors = JSON.parse(
  readFileSync(new URL("../../../test-vectors/quote-math.json", import.meta.url), "utf8"),
) as { cases: Vector[] };

describe("computeAmounts shared vectors (also checked by the Rust contract)", () => {
  it.each(vectors.cases)("$name", (v) => {
    const got = computeAmounts(
      BigInt(v.amount_in),
      rational(BigInt(v.ratio.num), BigInt(v.ratio.den)),
      v.fee_bps,
    );
    const want = v.expected
      ? {
          gross: BigInt(v.expected.gross),
          fee: BigInt(v.expected.fee),
          net: BigInt(v.expected.net),
        }
      : null;
    expect(got).toEqual(want);
  });
});

describe("computeAmounts properties", () => {
  // Deterministic LCG so failures reproduce.
  let seed = 0x2545f491n;
  const next = (): bigint =>
    (seed = (seed * 6364136223846793005n + 1442695040888963407n) % 2n ** 64n);

  it("never pays out more than the exact ratio output, and the fee rounds up", () => {
    for (let i = 0; i < 3000; i++) {
      const ratio = rational((next() % (1n << 30n)) + 1n, (next() % (1n << 30n)) + 1n);
      const amount = next() % (1n << 60n);
      const bps = Number(next() % BigInt(MAX_FEE_BPS + 1));
      const a = computeAmounts(amount, ratio, bps);
      expect(a).not.toBeNull();
      const { gross, fee, net } = a!;
      expect(net).toBe(gross - fee);
      expect(
        gross * ratio.den <= amount * ratio.num && amount * ratio.num < (gross + 1n) * ratio.den,
      ).toBe(true);
      expect(
        fee * 10_000n >= gross * BigInt(bps) && fee * 10_000n < gross * BigInt(bps) + 10_000n,
      ).toBe(true);
      expect(net * ratio.den <= amount * ratio.num).toBe(true);
    }
  });

  it("splitting a conversion never beats doing it once", () => {
    for (let i = 0; i < 2000; i++) {
      const ratio = rational((next() % (1n << 20n)) + 1n, (next() % (1n << 20n)) + 1n);
      const [x, y] = [next() % (1n << 50n), next() % (1n << 50n)];
      const bps = Number(next() % 101n);
      const split = computeAmounts(x, ratio, bps)!.net + computeAmounts(y, ratio, bps)!.net;
      expect(split <= computeAmounts(x + y, ratio, bps)!.net).toBe(true);
    }
  });

  it("returns null above u128 and rejects an out-of-range fee", () => {
    expect(computeAmounts(2n ** 128n, rational(1n), 0)).toBeNull();
    expect(computeAmounts(-1n, rational(1n), 0)).toBeNull();
    expect(() => computeAmounts(1n, rational(1n), 1.5)).toThrow(RangeError);
    expect(() => computeAmounts(1n, rational(1n), -1)).toThrow(RangeError);
  });
});
