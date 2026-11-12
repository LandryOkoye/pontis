import { readFileSync } from "node:fs";
import { keyFromSeed } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import {
  Prng,
  attestationMessage,
  seedFrom,
  signPoint,
  submitPriceArgs,
  verifyPoint,
  type FeedPoint,
} from "../src/index.ts";

const CONTRACT = "core.testnet";

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
    const attestation = signPoint(key, point, CONTRACT);
    expect(verifyPoint(attestation, point)).toBe(true);
    expect(verifyPoint(attestation, { ...point, price: point.price + 1n })).toBe(false);
    expect(verifyPoint(attestation, { ...point, asOfMs: point.asOfMs + 1 })).toBe(false);
    expect(verifyPoint(attestation, { ...point, simulated: false })).toBe(false);
    expect(verifyPoint(attestation, { ...point, representationId: "tgold-b" })).toBe(false);
    const other = keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 90));
    expect(verifyPoint({ ...attestation, publisherKey: other.publicKey }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, domain: "pontis-quote-v1" }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, domain: "pontis-price-v1" }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, contract: "other.testnet" }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, version: 2 }, point)).toBe(false);
    expect(verifyPoint({ ...attestation, publisherKey: "nonsense" }, point)).toBe(false);
  });
});

describe("price attestation vector (shared with the contract)", () => {
  const vector = JSON.parse(
    readFileSync(new URL("../../../test-vectors/price-attestation.json", import.meta.url), "utf8"),
  );
  const a = vector.attestation;
  const point: FeedPoint = {
    representationId: a.representation_id,
    price: BigInt(a.price),
    currency: a.currency,
    asOfMs: a.as_of_ms,
    source: a.source,
    simulated: a.simulated,
  };
  const key = keyFromSeed(Buffer.from(vector.seed_hex, "hex"));

  it("builds the same signed bytes and the same signature as the contract's test", () => {
    expect(key.publicKey).toBe(vector.public_key);
    expect(attestationMessage(point, a.contract).toString("hex")).toBe(vector.message_hex);
    expect(signPoint(key, point, a.contract).signature).toBe(vector.signature_base64);
  });

  it("sends exactly what `submit_price` takes, with the price as a decimal string", () => {
    const args = submitPriceArgs(point, signPoint(key, point, a.contract));
    expect(args.attestation).toEqual(a);
    expect(args.public_key).toBe(vector.public_key);
    expect(args.signature).toBe(vector.signature_base64);
  });

  it("refuses a price outside u128 rather than signing a truncated value", () => {
    expect(() => attestationMessage({ ...point, price: 1n << 128n }, a.contract)).toThrow(
      RangeError,
    );
    expect(() => attestationMessage({ ...point, price: -1n }, a.contract)).toThrow(RangeError);
  });
});
