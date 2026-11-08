import { describe, expect, it } from "vitest";
import { base58Decode, base58Encode } from "../src/base58.ts";
import { keyFromSeed, parseSecretKey } from "../src/keys.ts";

const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
// From test-vectors/quote-signing.json.
const PUBLIC = "ed25519:9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj";

describe("base58", () => {
  it("round-trips arbitrary bytes including leading zeros", () => {
    for (const bytes of [[0], [0, 0, 1], [255, 0, 7], [1, 2, 3, 4, 5, 250]]) {
      expect([...base58Decode(base58Encode(Uint8Array.from(bytes)))]).toEqual(bytes);
    }
    expect(base58Encode(Uint8Array.from([0, 0, 1]))).toBe("112");
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => base58Decode("0OIl")).toThrow(/invalid base58/);
  });
});

describe("quote key", () => {
  it("derives the public key the contract stores", () => {
    expect(keyFromSeed(seed).publicKey).toBe(PUBLIC);
  });

  it("parses a NEAR secret key and checks it against its embedded public key", () => {
    const publicBytes = base58Decode(PUBLIC.slice("ed25519:".length));
    const encoded = `ed25519:${base58Encode(Uint8Array.from([...seed, ...publicBytes]))}`;
    expect(parseSecretKey(encoded).publicKey).toBe(PUBLIC);
    const forged = `ed25519:${base58Encode(Uint8Array.from([...seed, ...publicBytes.map((b) => b ^ 1)]))}`;
    expect(() => parseSecretKey(forged)).toThrow(/does not match/);
  });

  it.each(["secp256k1:abc", "ed25519:", "ed25519:3mMk", "nonsense"])("rejects %j", (bad) => {
    expect(() => parseSecretKey(bad)).toThrow();
  });
});
