import { formatPrice, parsePrice } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLAIMS,
  RICH_CLAIMS,
  SIMULATED_CLAIMS,
  SIM_ANCHOR_MS,
  STEP_MS,
  SimulatedPriceFeed,
  feedConfigFor,
} from "../src/index.ts";

const DAY = 86_400_000;
const WINDOW_END = Date.UTC(2026, 10, 11);
const WINDOW_START = WINDOW_END - 90 * DAY;
const rep = (id: string, claim: string, decimals = 6) => ({
  id,
  canonicalAssetId: claim,
  decimals,
  unitMultiplier: { num: 1n, den: 10n ** BigInt(decimals) },
});
const feedFor = (claim: string, decimals = 6) =>
  new SimulatedPriceFeed(feedConfigFor([rep("x", claim, decimals)]));
const ninetyDays = (claim: string, decimals = 6) =>
  feedFor(claim, decimals).history("x", WINDOW_START, WINDOW_END);

describe("RICH_CLAIMS", () => {
  it("covers the 27 extra claims and leaves the default seven alone", () => {
    expect(Object.keys(RICH_CLAIMS)).toHaveLength(27);
    expect(Object.keys(RICH_CLAIMS).filter((id) => id in DEFAULT_CLAIMS)).toEqual([]);
    expect(Object.keys(SIMULATED_CLAIMS).sort()).toEqual(
      [...Object.keys(DEFAULT_CLAIMS), ...Object.keys(RICH_CLAIMS)].sort(),
    );
    for (const [id, profile] of Object.entries(DEFAULT_CLAIMS)) {
      expect(SIMULATED_CLAIMS[id]).toBe(profile);
    }
  });

  it("is what feedConfigFor uses by default", () => {
    const config = feedConfigFor([rep("a", "syn-eur"), rep("b", "syn-gold-oz"), rep("c", "nope")]);
    expect(Object.keys(config.representations)).toEqual(["a", "b"]);
    expect(config.claims).toBe(SIMULATED_CLAIMS);
  });

  it("gives each claim its own seed, a small premium clamp and jumps inside the 90 day window", () => {
    expect(new Set(Object.values(RICH_CLAIMS).map((p) => p.seed)).size).toBe(27);
    for (const [id, profile] of Object.entries(RICH_CLAIMS)) {
      expect(profile.seed, id).toBe(id);
      expect(profile.premium.maxPpm, id).toBeLessThan(35_000);
      for (const jump of profile.jumps) {
        expect(jump.atMs, id).toBeGreaterThanOrEqual(WINDOW_START);
        expect(jump.atMs, id).toBeLessThanOrEqual(WINDOW_END);
      }
    }
  });

  it("starts every claim near its start price and repeats exactly", () => {
    for (const [id, profile] of Object.entries(RICH_CLAIMS)) {
      const first = feedFor(id).history("x", SIM_ANCHOR_MS, SIM_ANCHOR_MS + DAY);
      const start = Number(profile.startPrice);
      const price = Number(formatPrice(first[0]?.price ?? 0n));
      expect(Math.abs(price - start) / start, id).toBeLessThan(0.04);
      expect(feedFor(id).history("x", SIM_ANCHOR_MS, SIM_ANCHOR_MS + DAY), id).toEqual(first);
    }
  });

  it("keeps every price positive over the 90 days and gives the six NAV claims NAV points", () => {
    const navClaims = Object.entries(RICH_CLAIMS).filter(([, p]) => p.navAccrualPpb !== undefined);
    expect(navClaims.map(([id]) => id)).toEqual([
      "syn-tbill-3m",
      "syn-tbill-ladder",
      "syn-mmf-usd",
      "syn-mmf-eur",
      "syn-note-sme",
      "syn-note-trade",
    ]);
    for (const id of Object.keys(RICH_CLAIMS)) {
      const points = ninetyDays(id);
      expect(points).toHaveLength((90 * DAY) / STEP_MS);
      expect(
        points.every((p) => p.price > 0n),
        id,
      ).toBe(true);
      expect(feedFor(id).hasNav("x"), id).toBe(navClaims.some(([n]) => n === id));
    }
  });

  it("accrues NAV at the profile rate: a three month bill gains about 1% in 90 days", () => {
    const feed = feedFor("syn-tbill-3m");
    const navs = feed.navHistory("x", WINDOW_START, WINDOW_END);
    const gain = (navs.at(-1)!.nav - navs[0]!.nav) * 10_000n;
    // 409 ppb a step over 25,919 steps compounds to about 1.07%, measured from 2026-08-13.
    expect(gain / navs[0]!.nav).toBeGreaterThanOrEqual(90n);
    expect(gain / navs[0]!.nav).toBeLessThan(130n);
  });

  it("holds the pegged currencies to target, the yen at eight-decimal precision", () => {
    for (const [claim, decimals] of [
      ["syn-eur", 6],
      ["syn-jpy", 6],
      ["syn-jpy", 0],
    ] as const) {
      const target = parsePrice(RICH_CLAIMS[claim]!.peg!.target);
      const prices = ninetyDays(claim, decimals).map((p) => p.price);
      expect(prices.every((p) => p > (target * 98n) / 100n && p < (target * 102n) / 100n)).toBe(
        true,
      );
    }
    expect(formatPrice(ninetyDays("syn-jpy")[0]!.price)).toMatch(/^0\.00[56]\d*$/);
  });

  it("steps at the scheduled corporate actions and not at an unscheduled split", () => {
    const ratioAcross = (claim: string, atMs: number) => {
      const feed = feedFor(claim);
      const before = feed.latest("x", atMs - 2 * STEP_MS)!.price;
      const after = feed.latest("x", atMs + 2 * STEP_MS)!.price;
      return Number(after) / Number(before);
    };
    expect(ratioAcross("syn-stock-marlowe", Date.UTC(2026, 8, 3))).toBeGreaterThan(1.25);
    expect(ratioAcross("syn-stock-quillfeather", Date.UTC(2026, 9, 14))).toBeLessThan(0.97);
    expect(ratioAcross("syn-oil-bbl", Date.UTC(2026, 9, 8))).toBeLessThan(0.99);
    expect(RICH_CLAIMS["syn-stock-tarnowski"]?.jumps).toEqual([]);
  });
});
