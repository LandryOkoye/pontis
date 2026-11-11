import { parsePrice } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import {
  SIM_ANCHOR_MS,
  STEP_MS,
  claimSeries,
  premiumSeries,
  type ClaimProfile,
} from "../src/index.ts";

const none = { volPpm: 0, reversionPpm: 0, maxPpm: 0 };
const walk: ClaimProfile = {
  seed: "walk",
  startPrice: "100",
  driftPpm: 0,
  volPpm: 1_000,
  premium: { volPpm: 400, reversionPpm: 50_000, maxPpm: 3_000 },
  jumps: [],
};
const upTo = (profile: ClaimProfile, steps: number) => {
  const s = claimSeries(profile);
  return Array.from({ length: steps }, (_, k) => s.at(k));
};

describe("claim series", () => {
  it("starts at the start price, repeats for a seed and differs for another", () => {
    expect(upTo(walk, 1)).toEqual([parsePrice("100")]);
    expect(upTo(walk, 500)).toEqual(upTo(walk, 500));
    expect(upTo(walk, 500)).not.toEqual(upTo({ ...walk, seed: "other" }, 500));
  });

  it("is the same value at a step whether it is read early or after a long run", () => {
    const s = claimSeries(walk);
    const early = s.at(10);
    s.at(2_000);
    expect(s.at(10)).toBe(early);
  });

  it("applies a jump once, in the step it falls in", () => {
    const flat = {
      ...walk,
      volPpm: 0,
      jumps: [{ atMs: SIM_ANCHOR_MS + 10 * STEP_MS + 1, num: 1n, den: 2n, reason: "split 2:1" }],
    };
    const prices = upTo(flat, 15).map((p) => p / 1_000_000n);
    expect(prices).toEqual([...Array(11).fill(10_000n), ...Array(4).fill(5_000n)]);
  });

  it("accrues a NAV without noise and compounds about 4.6% over a year at 428 ppb a step", () => {
    const nav = upTo({ ...walk, startPrice: "1", volPpm: 0, navAccrualPpb: 428 }, 105_121);
    expect(nav.every((p, i) => i === 0 || p > (nav[i - 1] as bigint))).toBe(true);
    const bps = (((nav[105_120] as bigint) - (nav[0] as bigint)) * 10_000n) / (nav[0] as bigint);
    expect(bps >= 440n && bps <= 470n).toBe(true);
  });

  it("pulls a pegged walk back toward its target", () => {
    const peg: ClaimProfile = {
      ...walk,
      startPrice: "1.2",
      volPpm: 12,
      peg: { target: "1", reversionPpm: 100_000 },
    };
    const prices = upTo(peg, 300);
    expect(prices[0]).toBe(parsePrice("1.2"));
    expect((prices[299] as bigint) < parsePrice("1.01")).toBe(true);
  });
});

describe("premium series", () => {
  it("stays inside its clamp, moves, and repeats for a representation", () => {
    const s = premiumSeries(walk, "rep-a");
    const values = Array.from({ length: 5_000 }, (_, k) => s.at(k));
    expect(values.every((v) => v >= -3_000n && v <= 3_000n)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(50);
    const again = premiumSeries(walk, "rep-a");
    expect(Array.from({ length: 50 }, (_, k) => again.at(k))).toEqual(values.slice(0, 50));
    expect(premiumSeries({ ...walk, premium: none }, "rep-a").at(10)).toBe(0n);
  });
});
