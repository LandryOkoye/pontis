import { readFileSync } from "node:fs";
import { verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keyFromSeed } from "../src/keys.ts";
import {
  QUOTE_VERSION,
  newNonce,
  quoteMessage,
  signQuote,
  toChainQuote,
  type QuoteFields,
} from "../src/quote.ts";

const vector = JSON.parse(
  readFileSync(new URL("../../../test-vectors/quote-signing.json", import.meta.url), "utf8"),
) as Record<string, string> & { quote: Record<string, string | number> };

const q = vector.quote;
const fields: QuoteFields = {
  version: q.version as number,
  contract: q.contract as string,
  user: q.user as string,
  tokenIn: q.token_in as string,
  tokenOut: q.token_out as string,
  amountIn: BigInt(q.amount_in as string),
  amountOutGross: BigInt(q.amount_out_gross as string),
  fee: BigInt(q.fee as string),
  amountOut: BigInt(q.amount_out as string),
  feeBps: q.fee_bps as number,
  expiresAtMs: q.expires_at_ms as number,
  nonce: q.nonce as string,
  compatibilityVersion: q.compatibility_version as number,
  policyVersion: q.policy_version as number,
};
const key = keyFromSeed(Buffer.from(vector.seed_hex as string, "hex"));

describe("quote signing shared vector (built independently by the Rust contract tests)", () => {
  it("produces the exact signed bytes", () => {
    expect(Buffer.from(quoteMessage(fields)).toString("hex")).toBe(vector.message_hex);
  });

  it("produces the exact signature, and it verifies under the stored public key", () => {
    const signed = signQuote(key, fields);
    expect(Buffer.from(signed.signature).toString("hex")).toBe(vector.signature_hex);
    expect(signed.signatureBase64).toBe(vector.signature_base64);
    expect(key.publicKey).toBe(vector.public_key);
    expect(verify(null, signed.message, key.privateKey, signed.signature)).toBe(true);
  });

  it("serialises the chain quote exactly as the contract's JSON expects", () => {
    expect(toChainQuote(fields)).toEqual(q);
    expect(QUOTE_VERSION).toBe(1);
  });

  it("changes the message when any signed field changes", () => {
    const base = Buffer.from(quoteMessage(fields)).toString("hex");
    const altered: Partial<QuoteFields>[] = [
      { amountOut: fields.amountOut + 1n },
      { user: "bob.testnet" },
      { expiresAtMs: fields.expiresAtMs + 1 },
      { nonce: "ff".repeat(16) },
      { compatibilityVersion: 3 },
      { feeBps: 11 },
    ];
    for (const change of altered) {
      expect(Buffer.from(quoteMessage({ ...fields, ...change })).toString("hex")).not.toBe(base);
    }
  });

  it("rejects values the contract could not parse", () => {
    expect(() => quoteMessage({ ...fields, nonce: "XYZ" })).toThrow(/nonce/);
    expect(() => quoteMessage({ ...fields, amountIn: 2n ** 128n })).toThrow(RangeError);
    expect(() => quoteMessage({ ...fields, feeBps: 70_000 })).toThrow(RangeError);
    expect(newNonce()).toMatch(/^[0-9a-f]{32}$/);
  });
});
