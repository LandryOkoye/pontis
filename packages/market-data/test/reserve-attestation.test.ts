import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { base58Decode, keyFromSeed } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import {
  parseReserveAttestation,
  reserveAttestationJson,
  reserveAttestationMessage,
  submitReserveAttestationArgs,
  type ReserveAttestationJson,
} from "../src/index.ts";

const vector = JSON.parse(
  readFileSync(new URL("../../../test-vectors/reserve-attestation.json", import.meta.url), "utf8"),
);
const json: ReserveAttestationJson = vector.attestation;
const att = parseReserveAttestation(json);
const key = keyFromSeed(Buffer.from(vector.seed_hex, "hex"));

function verifies(message: Buffer, signatureBase64: string): boolean {
  const raw = Buffer.from(base58Decode(vector.public_key.slice("ed25519:".length)));
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
  const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
  return verify(null, message, pub, Buffer.from(signatureBase64, "base64"));
}

describe("reserve attestation vector (built independently in Python)", () => {
  it("builds the same signed bytes and the same signature", () => {
    expect(key.publicKey).toBe(vector.public_key);
    expect(reserveAttestationMessage(att).toString("hex")).toBe(vector.message_hex);
    expect(submitReserveAttestationArgs(att, key).signature).toBe(vector.signature_base64);
  });

  it("sends exactly what `submit_reserve_attestation` takes", () => {
    const args = submitReserveAttestationArgs(att, key);
    expect(args.attestation).toEqual(json);
    expect(args.public_key).toBe(vector.public_key);
    expect(Object.keys(args)).toEqual(["attestation", "signature", "public_key"]);
  });

  it("carries the amount as a decimal string and the hash as 64 lowercase hex characters", () => {
    expect(att.reservedUnits).toBe(1_000_000_000_000n);
    expect(json.reserved_units).toBe("1000000000000");
    expect(json.report_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(reserveAttestationJson(att)).toEqual(json);
    expect(att.simulated).toBe(true);
    expect(att.source).toBe("simulated_custodian");
  });

  it("starts with the reserve domain, which no price or NAV signature can satisfy", () => {
    const message = reserveAttestationMessage(att);
    expect(message.subarray(0, 17).toString()).toBe("pontis-reserve-v1");
    expect(verifies(message, vector.signature_base64)).toBe(true);
    expect(verifies(Buffer.from(`x${message}`), vector.signature_base64)).toBe(false);
  });

  it("encodes the amount as 16 bytes little-endian and the hash as raw bytes", () => {
    const message = reserveAttestationMessage(att).toString("hex");
    expect(message).toContain("0010a5d4e8".padEnd(32, "0"));
    expect(message).toContain(json.report_hash);
    expect(message).not.toContain(Buffer.from(json.report_hash).toString("hex"));
  });
});

describe("tampered vectors", () => {
  it("each changes the bytes that are signed, so the valid signature no longer verifies", () => {
    expect(vector.tampered.map((t: { name: string }) => t.name)).toEqual([
      "another contract",
      "another custodian",
      "more reserves",
      "later as_of",
      "another report",
      "not simulated",
    ]);
    const valid = reserveAttestationMessage(att);
    for (const t of vector.tampered as { name: string; attestation: ReserveAttestationJson }[]) {
      const message = reserveAttestationMessage(parseReserveAttestation(t.attestation));
      expect(message.equals(valid), t.name).toBe(false);
      expect(verifies(message, vector.signature_base64), t.name).toBe(false);
    }
  });

  it("differs from the valid attestation in exactly one field each", () => {
    for (const t of vector.tampered as { name: string; attestation: Record<string, unknown> }[]) {
      const changed = Object.keys(json).filter(
        (k) => t.attestation[k] !== (json as unknown as Record<string, unknown>)[k],
      );
      expect(changed, t.name).toHaveLength(1);
    }
  });
});

describe("parseReserveAttestation and range checks", () => {
  it("refuses a malformed JSON argument", () => {
    expect(() => parseReserveAttestation({ ...json, reserved_units: "1e6" })).toThrow(RangeError);
    expect(() => parseReserveAttestation({ ...json, reserved_units: "-1" })).toThrow(RangeError);
    expect(() => parseReserveAttestation({ ...json, reserved_units: "01" })).toThrow(RangeError);
    const upper = json.report_hash.toUpperCase();
    expect(() => parseReserveAttestation({ ...json, report_hash: upper })).toThrow(RangeError);
    expect(() => parseReserveAttestation({ ...json, report_hash: "ab" })).toThrow(RangeError);
    expect(() => parseReserveAttestation({ ...json, version: 2 })).toThrow(RangeError);
  });

  it("refuses values outside u128 or the safe integer range", () => {
    const message = (patch: Partial<typeof att>) => () =>
      reserveAttestationMessage({ ...att, ...patch });
    expect(message({ reservedUnits: 1n << 128n })).toThrow(RangeError);
    expect(message({ reservedUnits: -1n })).toThrow(RangeError);
    expect(message({ asOfMs: -1 })).toThrow(RangeError);
    expect(message({ asOfMs: 1.5 })).toThrow(RangeError);
  });

  it("accepts the largest u128 amount, little-endian in 16 bytes", () => {
    const message = reserveAttestationMessage({ ...att, reservedUnits: (1n << 128n) - 1n });
    expect(message.toString("hex")).toContain("ff".repeat(16));
  });
});
