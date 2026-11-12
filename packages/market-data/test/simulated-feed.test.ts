import { describe, expect, it } from "vitest";
import {
  SIM_ANCHOR_MS,
  STEP_MS,
  SimulatedPriceFeed,
  type ClaimProfile,
  type SimulatedFeedConfig,
} from "../src/index.ts";

const DAY = 86_400_000;
const FROM = SIM_ANCHOR_MS + 40 * DAY;
const premium = { volPpm: 200, reversionPpm: 30_000, maxPpm: 8_000 };
const claim = (over: Partial<ClaimProfile>): ClaimProfile => ({
  seed: "t",
  startPrice: "100",
  driftPpm: 0,
  volPpm: 600,
  premium,
  jumps: [],
  ...over,
});
const token = (claimId: string, num = 1n, den = 1n) => ({
  claimId,
  canonicalPerToken: { num, den },
});
const config: SimulatedFeedConfig = {
  claims: {
    metal: claim({ seed: "metal" }),
    fund: claim({ seed: "fund", startPrice: "1", volPpm: 0, navAccrualPpb: 428 }),
  },
  representations: {
    "metal-a": token("metal"),
    "metal-tenth": token("metal", 1n, 10n),
    "metal-b": token("metal"),
    "fund-a": token("fund"),
  },
};

describe("SimulatedPriceFeed", () => {
  it("is deterministic, on the grid, positive and always labelled simulated", () => {
    const one = new SimulatedPriceFeed(config).history("metal-a", FROM, FROM + DAY);
    const two = new SimulatedPriceFeed(config).history("metal-a", FROM, FROM + DAY);
    expect(one).toEqual(two);
    expect(one).toHaveLength(DAY / STEP_MS);
    expect(one.every((p) => p.simulated && p.source === "simulated_feed" && p.price > 0n)).toBe(
      true,
    );
    expect(one.every((p) => (p.asOfMs - SIM_ANCHOR_MS) % STEP_MS === 0)).toBe(true);
    // A later window continues the same series rather than starting a new one.
    const feed = new SimulatedPriceFeed(config);
    expect(feed.history("metal-a", FROM + 3 * STEP_MS, FROM + 5 * STEP_MS)).toEqual(
      one.slice(3, 5),
    );
  });

  it("returns the newest point at or before a time, and nothing before the series begins", () => {
    const feed = new SimulatedPriceFeed(config);
    expect(feed.latest("metal-a", SIM_ANCHOR_MS - 1)).toBeUndefined();
    expect(feed.latest("metal-a", FROM + 2 * STEP_MS + 17)?.asOfMs).toBe(FROM + 2 * STEP_MS);
  });

  it("prices a token by the canonical units in it", () => {
    const quiet: SimulatedFeedConfig = {
      ...config,
      claims: {
        ...config.claims,
        metal: claim({ seed: "metal", premium: { volPpm: 0, reversionPpm: 0, maxPpm: 0 } }),
      },
    };
    const feed = new SimulatedPriceFeed(quiet);
    const [whole] = feed.history("metal-a", FROM, FROM + STEP_MS);
    const [tenth] = feed.history("metal-tenth", FROM, FROM + STEP_MS);
    expect(whole && tenth && whole.price / 10n === tenth.price).toBe(true);
  });

  it("keeps two wrappers of one claim close but not identical", () => {
    const feed = new SimulatedPriceFeed(config);
    const a = feed.history("metal-a", FROM, FROM + 5 * DAY);
    const b = feed.history("metal-b", FROM, FROM + 5 * DAY);
    const gaps = a.map((p, i) => {
      const q = (b[i] as { price: bigint }).price;
      return ((p.price > q ? p.price - q : q - p.price) * 1_000_000n) / p.price;
    });
    // Each is within 0.8% of the claim, so within 1.6% of each other.
    expect(gaps.every((g) => g <= 16_020n)).toBe(true);
    expect(gaps.some((g) => g > 0n)).toBe(true);
  });

  it("exposes NAV only for NAV claims and grows it monotonically", () => {
    const feed = new SimulatedPriceFeed(config);
    expect([feed.hasNav("fund-a"), feed.hasNav("metal-a")]).toEqual([true, false]);
    expect(feed.navHistory("metal-a", FROM, FROM + DAY)).toEqual([]);
    const nav = feed.navHistory("fund-a", FROM, FROM + 30 * DAY);
    expect(nav.every((p, i) => i === 0 || p.nav > (nav[i - 1] as { nav: bigint }).nav)).toBe(true);
    expect(nav.every((p) => p.simulated && p.source === "simulated_feed")).toBe(true);
  });

  it("refuses a representation it has no profile for", () => {
    expect(() => new SimulatedPriceFeed(config).latest("ghost", FROM)).toThrow(
      /no simulated profile/,
    );
  });
});
