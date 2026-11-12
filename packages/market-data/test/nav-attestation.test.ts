import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { keyFromSeed } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import { navStrikeMessage, submitNavStrikeArgs, type NavStrikePoint } from "../src/index.ts";

const vector = JSON.parse(
  readFileSync(new URL("../../../test-vectors/nav-strike.json", import.meta.url), "utf8"),
);
const a = vector.attestation;
const strike: NavStrikePoint = {
  representationId: a.representation_id,
  nav: BigInt(a.nav),
  currency: a.currency,
  asOfMs: a.as_of_ms,
  cutoffMs: a.cutoff_ms,
  source: a.source,
  simulated: a.simulated,
};
const key = keyFromSeed(Buffer.from(vector.seed_hex, "hex"));

describe("NAV strike vector (built independently in Python)", () => {
  it("builds the same signed bytes and the same signature", () => {
    expect(key.publicKey).toBe(vector.public_key);
    expect(navStrikeMessage(strike, a.contract).toString("hex")).toBe(vector.message_hex);
    expect(submitNavStrikeArgs(strike, key, a.contract).signature).toBe(vector.signature_base64);
  });

  it("sends exactly what `submit_nav_strike` takes, the NAV as a decimal string", () => {
    const args = submitNavStrikeArgs(strike, key, a.contract);
    expect(args.attestation).toEqual(a);
    expect(args.public_key).toBe(vector.public_key);
  });

  it("uses a domain a price signature cannot satisfy", () => {
    const message = navStrikeMessage(strike, a.contract);
    expect(message.subarray(0, 13).toString()).toBe("pontis-nav-v1");
    const spki = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      createPublicKey(key.privateKey).export({ format: "der", type: "spki" }).subarray(12),
    ]);
    const { signature } = submitNavStrikeArgs(strike, key, a.contract);
    const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
    expect(verify(null, message, pub, Buffer.from(signature, "base64"))).toBe(true);
    expect(verify(null, Buffer.from(`x${message}`), pub, Buffer.from(signature, "base64"))).toBe(
      false,
    );
  });

  it("refuses values outside u128 or the safe integer range", () => {
    expect(() => navStrikeMessage({ ...strike, nav: 1n << 128n }, a.contract)).toThrow(RangeError);
    expect(() => navStrikeMessage({ ...strike, nav: -1n }, a.contract)).toThrow(RangeError);
    expect(() => navStrikeMessage({ ...strike, cutoffMs: -1 }, a.contract)).toThrow(RangeError);
    expect(() => navStrikeMessage({ ...strike, asOfMs: 1.5 }, a.contract)).toThrow(RangeError);
  });
});
