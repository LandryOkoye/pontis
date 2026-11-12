import { readFileSync } from "node:fs";
import { rational } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import {
  checkLimits,
  deviationBps,
  deviationTerms,
  effectiveFeeBps,
  exceedsDeviation,
  skewBps,
} from "../src/guard.ts";

const vectors = JSON.parse(
  readFileSync(new URL("../../../test-vectors/route-guard.json", import.meta.url), "utf8"),
);

/* eslint-disable @typescript-eslint/no-explicit-any */
const cases = (list: any[]): [number, any][] => list.map((c, i) => [i, c]);

const ratio = (r: { num: string; den: string }) => rational(BigInt(r.num), BigInt(r.den));

describe("guard shared vectors (also checked by the Rust contract)", () => {
  it.each(cases(vectors.deviation))("deviation case %i", (_i, c) => {
    const i = c.input;
    const terms = deviationTerms(
      ratio(i.ratio),
      BigInt(i.price_from),
      BigInt(i.price_to),
      i.decimals_from,
      i.decimals_to,
    );
    const exceeded = terms && exceedsDeviation(terms.x, terms.y, i.max_bps);
    const bps = terms && deviationBps(terms.x, terms.y);
    if (exceeded === null || exceeded === undefined || bps === null || bps === undefined) {
      expect(c.expected.available).toBe(false);
      return;
    }
    expect(c.expected.available).toBe(true);
    expect(exceeded).toBe(c.expected.exceeds);
    expect(bps.toString()).toBe(c.expected.deviation_bps);
  });

  it.each(cases(vectors.skew))("skew case %i", (_i, c) => {
    const i = c.input;
    expect(skewBps(i.skew_max_bps, BigInt(i.reference), BigInt(i.inventory_after))).toBe(
      c.expected,
    );
  });

  it.each(cases(vectors.fee))("effective fee case %i", (_i, c) => {
    const i = c.input;
    expect(
      effectiveFeeBps({
        protocolFeeBps: i.protocol_fee_bps,
        extraFeeBps: i.extra_fee_bps,
        skewMaxBps: i.skew_max_bps,
        reference: BigInt(i.reference),
        inventory: BigInt(i.inventory),
        amountIn: BigInt(i.amount_in),
        ratio: ratio(i.ratio),
      }),
    ).toBe(c.expected);
  });

  it.each(cases(vectors.limits))("limits case %i", (_i, c) => {
    const i = c.input;
    expect(
      checkLimits(
        {
          minAmountIn: BigInt(i.min_amount_in),
          maxAmountIn: BigInt(i.max_amount_in),
          windowMs: i.window_ms,
          maxWindowAmountIn: BigInt(i.max_window_amount_in),
        },
        BigInt(i.amount_in),
        BigInt(i.window_used),
      ),
    ).toBe(c.expected);
  });
});

describe("guard arithmetic properties", () => {
  it("skew never exceeds its maximum and does not fall as the vault empties", () => {
    for (const max of [0, 1, 100, 400]) {
      let last = 0;
      for (let after = 1000n; after >= 0n; after -= 50n) {
        const s = skewBps(max, 1000n, after);
        expect(s).toBeLessThanOrEqual(max);
        expect(s).toBeGreaterThanOrEqual(last);
        last = s;
      }
    }
  });

  it("a market that matches the approved ratio has zero deviation", () => {
    const t = deviationTerms(rational(1000n, 1n), 100n * 10n ** 8n, 10n * 10n ** 8n, 6, 8);
    expect(t && deviationBps(t.x, t.y)).toBe(0n);
  });
});
