import { devKey } from "@pontis/dev-keys";
import { verifyPoint } from "@pontis/market-data";
import { describe, expect, it } from "vitest";
import { DEMO_GUARD, parseGuardsArgs } from "../lib/guard-ops.ts";
import { priceSubmissions } from "../lib/price-relay.ts";

const registry = [
  {
    id: "tgold-a",
    canonicalAssetId: "syn-gold-oz",
    decimals: 6,
    unitMultiplier: { num: 1n, den: 1_000_000n },
  },
  {
    id: "tgold-b",
    canonicalAssetId: "syn-gold-oz",
    decimals: 9,
    unitMultiplier: { num: 1n, den: 1_000_000_000n },
  },
  {
    id: "mystery",
    canonicalAssetId: "no-such-claim",
    decimals: 6,
    unitMultiplier: { num: 1n, den: 1_000_000n },
  },
];
const NOW = Date.UTC(2026, 10, 11, 12, 0, 7);

describe("price relay", () => {
  it("signs a labelled, simulated price for each representation the feed can price", () => {
    const subs = priceSubmissions(registry, NOW, "core.testnet");
    expect(subs.map((s) => s.representationId)).toEqual(["tgold-a", "tgold-b"]);
    for (const { args } of subs) {
      expect(args.attestation).toMatchObject({
        contract: "core.testnet",
        currency: "USD",
        as_of_ms: NOW,
        simulated: true,
        source: "simulated_feed",
      });
      expect(args.public_key).toBe(devKey("price-publisher").publicKey);
    }
  });

  it("produces a signature that verifies for that contract and no other", () => {
    const [sub] = priceSubmissions(registry, NOW, "core.testnet");
    const a = sub!.args.attestation;
    const point = {
      representationId: a.representation_id,
      price: BigInt(a.price),
      currency: a.currency,
      asOfMs: a.as_of_ms,
      source: "simulated_feed" as const,
      simulated: a.simulated,
    };
    const attestation = {
      domain: "pontis-price-v2",
      version: a.version,
      contract: a.contract,
      publisherKey: sub!.args.public_key,
      signature: sub!.args.signature,
    };
    expect(verifyPoint(attestation, point)).toBe(true);
    expect(verifyPoint({ ...attestation, contract: "core2.testnet" }, point)).toBe(false);
  });

  it("keeps the two demo wrappers of one claim inside the preset guard", () => {
    // Over a month of five-minute steps the simulated premiums never approach the guard.
    let worst = 0n;
    for (let day = 0; day < 30; day++) {
      const [a, b] = priceSubmissions(registry, NOW - day * 86_400_000, "core.testnet");
      const [pa, pb] = [BigInt(a!.args.attestation.price), BigInt(b!.args.attestation.price)];
      const gap = ((pa > pb ? pa - pb : pb - pa) * 10_000n) / pa;
      if (gap > worst) worst = gap;
    }
    expect(worst).toBeLessThan(BigInt(DEMO_GUARD.max_deviation_bps));
  });
});

describe("guards arguments", () => {
  it("parses the commands the runbook uses", () => {
    expect(parseGuardsArgs(["status"])).toEqual({ kind: "status" });
    expect(parseGuardsArgs(["set-guard", "tgold-a", "tgold-b"])).toEqual({
      kind: "set-guard",
      fromId: "tgold-a",
      toId: "tgold-b",
    });
    expect(parseGuardsArgs(["publish"])).toEqual({ kind: "publish", loopSeconds: undefined });
    expect(parseGuardsArgs(["publish", "--loop", "30"])).toEqual({
      kind: "publish",
      loopSeconds: 30,
    });
  });

  it.each([
    [[], /usage/],
    [["explode"], /usage/],
    [["set-guard", "tgold-a"], /two different/],
    [["set-guard", "tgold-a", "tgold-a"], /two different/],
    [["publish", "--loop", "1"], /5 to 3600/],
    [["publish", "now"], /5 to 3600/],
  ])("refuses %j", (argv, message) => {
    expect(() => parseGuardsArgs(argv)).toThrow(message);
  });
});
