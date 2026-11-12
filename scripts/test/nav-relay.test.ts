import { devKey } from "@pontis/dev-keys";
import { describe, expect, it } from "vitest";
import { navSubmission } from "../lib/nav-relay.ts";

describe("nav relay", () => {
  const registry = [
    {
      id: "tfund-a",
      canonicalAssetId: "no-such-claim",
      decimals: 6,
      unitMultiplier: { num: 1n, den: 1_000_000n },
    },
  ];
  const NOW = Date.UTC(2026, 10, 11, 12, 0, 7);

  it("signs a labelled, simulated strike with the dev publisher key", () => {
    const args = navSubmission(registry, "tfund-a", NOW, "core.testnet", 3_600_000, 105_000_000n);
    expect(args.attestation).toEqual({
      version: 1,
      contract: "core.testnet",
      representation_id: "tfund-a",
      nav: "105000000",
      currency: "USD",
      as_of_ms: NOW,
      cutoff_ms: NOW + 3_600_000,
      simulated: true,
      source: "simulated_feed",
    });
    expect(args.public_key).toBe(devKey("price-publisher").publicKey);
  });

  it("refuses to invent a NAV the feed does not have", () => {
    expect(() => navSubmission(registry, "tfund-a", NOW, "core.testnet", 3_600_000)).toThrow(
      /pass --nav/,
    );
  });
});
