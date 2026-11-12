import { sign as edSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keyFromSeed } from "../src/keys.ts";
import {
  NEP413_TAG,
  nep413Digest,
  nep413Preimage,
  signNep413,
  verifyNep413,
  type Nep413Payload,
} from "../src/nep413.ts";

interface Case {
  name: string;
  message: string;
  nonce_hex: string;
  nonce_base64: string;
  recipient: string;
  callback_url: string | null;
  preimage_hex: string;
  sha256_hex: string;
  signature_hex: string;
  signature_base64: string;
}
const vectors = JSON.parse(
  readFileSync(new URL("../../../test-vectors/nep413.json", import.meta.url), "utf8"),
) as { tag: number; seed_hex: string; public_key: string; cases: Case[] };

const payloadOf = (c: Case): Nep413Payload => ({
  message: c.message,
  nonce: Buffer.from(c.nonce_hex, "hex"),
  recipient: c.recipient,
  callbackUrl: c.callback_url,
});
const key = keyFromSeed(Buffer.from(vectors.seed_hex, "hex"));

describe("NEP-413 against the independent vectors (test-vectors/nep413.json)", () => {
  it("uses the tag 2^31 + 413", () => {
    expect(NEP413_TAG).toBe(2 ** 31 + 413);
    expect(vectors.tag).toBe(NEP413_TAG);
  });

  it("derives the vector public key from the seed", () => {
    expect(key.publicKey).toBe(vectors.public_key);
  });

  for (const c of vectors.cases) {
    it(`${c.name}: builds the same bytes, hash and signature`, () => {
      const payload = payloadOf(c);
      expect(nep413Preimage(payload).toString("hex")).toBe(c.preimage_hex);
      expect(nep413Digest(payload).toString("hex")).toBe(c.sha256_hex);
      // ed25519 is deterministic, so our signature equals the Python one.
      expect(Buffer.from(signNep413(key, payload), "base64").toString("hex")).toBe(c.signature_hex);
    });

    it(`${c.name}: verifies the vector signature`, () => {
      expect(verifyNep413(payloadOf(c), vectors.public_key, c.signature_base64)).toBe(true);
    });
  }
});

describe("verifyNep413 refuses", () => {
  const c = vectors.cases[0]!;
  const ok = (
    over: Partial<Nep413Payload> = {},
    pub = vectors.public_key,
    sig = c.signature_base64,
  ) => verifyNep413({ ...payloadOf(c), ...over }, pub, sig);

  it("accepts the unmodified vector", () => {
    expect(ok()).toBe(true);
  });

  it("changed message, recipient, nonce or callback URL", () => {
    expect(ok({ message: "ho" })).toBe(false);
    expect(ok({ recipient: "myapp.org" })).toBe(false);
    expect(ok({ nonce: Buffer.alloc(32, 1) })).toBe(false);
    expect(ok({ callbackUrl: "myapp.com/other" })).toBe(false);
    expect(ok({ callbackUrl: null })).toBe(false);
  });

  it("another key, a corrupted signature, and malformed input", () => {
    const other = keyFromSeed(Buffer.alloc(32, 9)).publicKey;
    expect(ok({}, other)).toBe(false);
    const sig = Buffer.from(c.signature_base64, "base64");
    sig[0] = (sig[0] ?? 0) ^ 1;
    expect(ok({}, vectors.public_key, sig.toString("base64"))).toBe(false);
    expect(ok({}, vectors.public_key, "")).toBe(false);
    expect(ok({}, vectors.public_key, "not base64!!")).toBe(false);
    expect(ok({}, vectors.public_key, c.signature_hex)).toBe(false);
    expect(ok({}, "secp256k1:abc")).toBe(false);
    expect(ok({}, "ed25519:abc")).toBe(false);
    expect(ok({}, "ed25519:0OIl")).toBe(false);
  });

  it("a signature over the raw preimage instead of its hash (not NEP-413)", () => {
    const raw = edSign(null, nep413Preimage(payloadOf(c)), key.privateKey).toString("base64");
    expect(ok({}, vectors.public_key, raw)).toBe(false);
  });

  it("a nonce that is not 32 bytes", () => {
    expect(() => nep413Preimage({ ...payloadOf(c), nonce: Buffer.alloc(31) })).toThrow(/32 bytes/);
  });
});
