import { describe, expect, it } from "vitest";
import {
  formatBpsPercent,
  nextRedemptionWindowMs,
  ratioBps,
  redemptionFee,
  redemptionWindowOpen,
} from "../src/index.ts";

const DAY = 86_400_000;
const week = { anchorMs: 1_000, lengthMs: 2 * DAY, periodMs: 7 * DAY };

describe("redemption window (ADR 0020 section 7)", () => {
  it("is always open with period 0", () => {
    expect(redemptionWindowOpen({ anchorMs: 5, lengthMs: 0, periodMs: 0 }, 0)).toBe(true);
    expect(nextRedemptionWindowMs({ anchorMs: 5, lengthMs: 0, periodMs: 0 }, 0)).toBeNull();
  });

  it("is closed before the anchor and opens at it", () => {
    expect(redemptionWindowOpen(week, 999)).toBe(false);
    expect(nextRedemptionWindowMs(week, 999)).toBe(1_000);
    expect(redemptionWindowOpen(week, 1_000)).toBe(true);
  });

  it("closes exactly at the end of the length and reopens each period", () => {
    expect(redemptionWindowOpen(week, 1_000 + 2 * DAY - 1)).toBe(true);
    expect(redemptionWindowOpen(week, 1_000 + 2 * DAY)).toBe(false);
    expect(nextRedemptionWindowMs(week, 1_000 + 2 * DAY)).toBe(1_000 + 7 * DAY);
    expect(redemptionWindowOpen(week, 1_000 + 7 * DAY)).toBe(true);
    expect(nextRedemptionWindowMs(week, 1_000 + 3 * DAY)).toBe(1_000 + 7 * DAY);
    expect(nextRedemptionWindowMs(week, 1_000 + 8 * DAY)).toBeNull();
    expect(nextRedemptionWindowMs(week, 1_000 + 10 * DAY)).toBe(1_000 + 14 * DAY);
  });
});

describe("redemption fee", () => {
  it("rounds the fee up so the issuer never undercharges", () => {
    expect(redemptionFee(5_000_000n, 25)).toEqual({ fee: 12_500n, net: 4_987_500n });
    expect(redemptionFee(1n, 25)).toEqual({ fee: 1n, net: 0n });
    expect(redemptionFee(10_001n, 1)).toEqual({ fee: 2n, net: 9_999n });
    expect(redemptionFee(777n, 0)).toEqual({ fee: 0n, net: 777n });
  });
});

describe("ratios", () => {
  it("floors basis points and has no ratio for a zero denominator", () => {
    expect(ratioBps(1_000n, 1_000n)).toBe(10_000);
    expect(ratioBps(1n, 3n)).toBe(3_333);
    expect(ratioBps(5n, 0n)).toBeNull();
  });

  it("formats a percentage with two decimals", () => {
    expect(formatBpsPercent(10_000)).toBe("100.00");
    expect(formatBpsPercent(10_050)).toBe("100.50");
    expect(formatBpsPercent(7)).toBe("0.07");
  });
});
