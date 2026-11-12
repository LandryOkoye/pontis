// Signed price attestations (ADR 0015 section 5, ADR 0016 section 1). The simulated feed signs
// every point with a price-publisher key so the oracle path is exercised end to end, and the same
// bytes are what `submit_price` verifies on chain: `b"pontis-price-v2" ++ borsh(payload)`.
// `test-vectors/price-attestation.json` pins the layout for Rust, TypeScript and Python.

import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { base58Decode, type QuoteKey } from "@pontis/quote-engine";
import { U128_MAX } from "@pontis/domain";
import { le, str } from "./borsh.ts";
import type { FeedPoint } from "./types.ts";

export const PRICE_ATTESTATION_DOMAIN = "pontis-price-v2";
export const PRICE_ATTESTATION_VERSION = 1;

export interface PriceAttestation {
  domain: string;
  version: number;
  /** The core contract the price is signed for; a price cannot be replayed on another deployment. */
  contract: string;
  /** `ed25519:<base58 public key>` of the signer. */
  publisherKey: string;
  /** Standard base64, 64 bytes. */
  signature: string;
}

/** The exact bytes a publisher signs for `point` on `contract`. */
export function attestationMessage(point: FeedPoint, contract: string): Buffer {
  if (point.price < 0n || point.price > U128_MAX) throw new RangeError("price outside u128");
  if (!Number.isSafeInteger(point.asOfMs) || point.asOfMs < 0) {
    throw new RangeError("asOfMs outside the supported range");
  }
  return Buffer.concat([
    Buffer.from(PRICE_ATTESTATION_DOMAIN, "utf8"),
    Buffer.from([PRICE_ATTESTATION_VERSION]),
    str(contract),
    str(point.representationId),
    le(point.price, 16),
    str(point.currency),
    le(BigInt(point.asOfMs), 8),
    Buffer.from([point.simulated ? 1 : 0]),
    str(point.source),
  ]);
}

export function signPoint(key: QuoteKey, point: FeedPoint, contract: string): PriceAttestation {
  return {
    domain: PRICE_ATTESTATION_DOMAIN,
    version: PRICE_ATTESTATION_VERSION,
    contract,
    publisherKey: key.publicKey,
    signature: sign(null, attestationMessage(point, contract), key.privateKey).toString("base64"),
  };
}

/**
 * The same attestation as `signPoint`, signed on the libuv threadpool instead of the main thread.
 * Ed25519 is deterministic, so the bytes are identical; this only lets a backfill of tens of
 * thousands of points use several cores.
 */
export function signPointAsync(
  key: QuoteKey,
  point: FeedPoint,
  contract: string,
): Promise<PriceAttestation> {
  return new Promise((resolve, reject) => {
    sign(null, attestationMessage(point, contract), key.privateKey, (error, signature) => {
      if (error) return reject(error);
      resolve({
        domain: PRICE_ATTESTATION_DOMAIN,
        version: PRICE_ATTESTATION_VERSION,
        contract,
        publisherKey: key.publicKey,
        signature: signature.toString("base64"),
      });
    });
  });
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

/** True only when the signature matches this exact point, contract and claimed publisher key. */
export function verifyPoint(attestation: PriceAttestation, point: FeedPoint): boolean {
  if (attestation.domain !== PRICE_ATTESTATION_DOMAIN) return false;
  if (attestation.version !== PRICE_ATTESTATION_VERSION) return false;
  try {
    return verify(
      null,
      attestationMessage(point, attestation.contract),
      publicKeyObject(attestation.publisherKey),
      Buffer.from(attestation.signature, "base64"),
    );
  } catch {
    return false;
  }
}

/** The arguments of `submit_price` for a signed point: what a relayer sends, nothing else. */
export function submitPriceArgs(point: FeedPoint, attestation: PriceAttestation) {
  return {
    attestation: {
      version: attestation.version,
      contract: attestation.contract,
      representation_id: point.representationId,
      price: point.price.toString(),
      currency: point.currency,
      as_of_ms: point.asOfMs,
      simulated: point.simulated,
      source: point.source,
    },
    signature: attestation.signature,
    public_key: attestation.publisherKey,
  };
}
