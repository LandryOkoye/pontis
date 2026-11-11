import { describe, expect, it } from "vitest";
import { DEFAULT_CLAIMS, SIM_ANCHOR_MS, SimulatedPriceFeed, feedConfigFor } from "../src/index.ts";
import { formatPrice } from "@pontis/domain";

const DAY = 86_400_000;
const rep = (id: string, canonicalAssetId: string, decimals: number, den: bigint) => ({
  id,
  canonicalAssetId,
  decimals,
  unitMultiplier: { num: 1n, den },
});

describe("feedConfigFor", () => {
  it("maps registry representations to canonical units per whole token and skips unknown claims", () => {
    const config = feedConfigFor([
      rep("tgold-a", "syn-gold-oz", 6, 1_000_000n),
      rep("tgold-b", "syn-gold-oz", 8, 1_000_000_000n),
      rep("mystery", "not-simulated", 6, 1_000_000n),
    ]);
    expect(Object.keys(config.representations)).toEqual(["tgold-a", "tgold-b"]);
    // One token of A is one canonical ounce; one token of B is a tenth of one.
    expect(config.representations["tgold-a"]?.canonicalPerToken).toEqual({
      num: 1_000_000n,
      den: 1_000_000n,
    });
    expect(config.representations["tgold-b"]?.canonicalPerToken).toEqual({
      num: 100_000_000n,
      den: 1_000_000_000n,
    });
  });

  it("gives every default claim a feed that starts near its start price", () => {
    for (const [claimId, profile] of Object.entries(DEFAULT_CLAIMS)) {
      const config = feedConfigFor([rep("x", claimId, 6, 1_000_000n)]);
      const [first] = new SimulatedPriceFeed(config).history(
        "x",
        SIM_ANCHOR_MS,
        SIM_ANCHOR_MS + DAY,
      );
      // The first point is the start price within the premium clamp.
      const start = Number(profile.startPrice);
      const price = Number(formatPrice(first?.price ?? 0n));
      expect(Math.abs(price - start) / start).toBeLessThan(0.04);
    }
  });
});
