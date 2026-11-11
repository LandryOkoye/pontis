import { keyFromSeed } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import { Prng, seedFrom, signPoint, verifyPoint, type FeedPoint } from "../src/index.ts";

describe("Prng", () => {
  it("repeats for a seed and differs for another", () => {
    const draw = (seed: number) => {
      const rng = new Prng(seed);
      return Array.from({ length: 5 }, () => rng.nextU32());
    };
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
    expect(seedFrom("claim:syn-gold-oz")).toBe(seedFrom("claim:syn-gold-oz"));
    expect(seedFrom("a")).not.toBe(seedFrom("b"));
  });

  it("draws a centred normal with a standard deviation of 65536", () => {
    const rng = new Prng(11);
    const n = 20_000;
    const draws = Array.from({ length: n }, () => rng.normalQ16());
    const mean = draws.reduce((s, d) => s + d, 0) / n;
    const sd = Math.sqrt(draws.reduce((s, d) => s + (d - mean) ** 2, 0) / n);
    expect(Math.abs(mean)).toBeLessThan(2_000);
    expect(sd).toBeGreaterThan(62_000);
    expect(sd).toBeLessThan(69_000);
  });

  it("keeps below() inside its bound", () => {
    const rng = new Prng(3);
    expect(Array.from({ length: 1_000 }, () => rng.below(7)).every((v) => v >= 0 && v < 7)).toBe(
      true,
    );
  });
});

describe("price attestations", () => {
  const key = keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 40));
  const point: FeedPoint = {
    representationId: "tgold-a",
    price: 265_000_000_000n,
    currency: "USD",
    asOfMs: 1_790_000_000_000,
    source: "simulated_feed",
    simulated: true,
  };

  it("verifies the exact point and refuses any changed field, key or domain", () => {
    const attestation = signPoint(key, point);
    expect(verifyPoint(attestation, point)).toBe(true);
    expect(verifyPoint(attestation, { ...point, price: point.price + 1n })).toBe(false);
    expect(verifyPoint(attestation, { ...point, asOfMs: point.asOfMs + 1 })).toBe(false);
    expect(verifyPoint(attestation, { ...point, simulated: false })).toBe(false);
    expect(verifyPoint(attestation, { ...point, representationId: "tgold-b" })).toBe(false);
    const other = keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 90));
    expect(verifyPoint({ ...attestation, publisherKey: other.publicKey }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, domain: "pontis-quote-v1" }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, publisherKey: "nonsense" }, point)).toBe(false);
  });
});
