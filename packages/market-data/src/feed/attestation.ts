// Signed price attestations (ADR 0015 section 5). The simulated feed signs every point with a
// price-publisher key so the oracle path is exercised end to end. This is the off-chain v1 format;
// the on-chain verifier (phase 2) fixes its own byte layout under its own ADR and domain string.

import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { base58Decode, type QuoteKey } from "@pontis/quote-engine";
import { formatPrice } from "@pontis/domain";
import type { FeedPoint } from "./types.ts";

export const PRICE_ATTESTATION_DOMAIN = "pontis-price-v1";

export interface PriceAttestation {
  domain: string;
  /** `ed25519:<base58 public key>` of the signer. */
  publisherKey: string;
  /** Standard base64, 64 bytes. */
  signature: string;
}

/** The signed bytes: the domain, then each field on its own line. IDs never contain a newline. */
export function attestationMessage(point: FeedPoint): Buffer {
  const fields = [
    PRICE_ATTESTATION_DOMAIN,
    point.representationId,
    formatPrice(point.price),
    point.currency,
    String(point.asOfMs),
    point.source,
    String(point.simulated),
  ];
  return Buffer.from(fields.join("\n"), "utf8");
}

export function signPoint(key: QuoteKey, point: FeedPoint): PriceAttestation {
  return {
    domain: PRICE_ATTESTATION_DOMAIN,
    publisherKey: key.publicKey,
    signature: sign(null, attestationMessage(point), key.privateKey).toString("base64"),
  };
}

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function publicKeyObject(encoded: string): KeyObject {
  const [curve, body] = encoded.split(":");
  const raw = curve === "ed25519" && body ? base58Decode(body) : undefined;
  if (!raw || raw.length !== 32) throw new Error("expected an ed25519:<base58> public key");
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/** True only when the signature matches this exact point and the claimed publisher key. */
export function verifyPoint(attestation: PriceAttestation, point: FeedPoint): boolean {
  if (attestation.domain !== PRICE_ATTESTATION_DOMAIN) return false;
  try {
    return verify(
      null,
      attestationMessage(point),
      publicKeyObject(attestation.publisherKey),
      Buffer.from(attestation.signature, "base64"),
    );
  } catch {
    return false;
  }
}
