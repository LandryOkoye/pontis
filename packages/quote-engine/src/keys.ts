// The quote-signer ed25519 key (ADR 0006). NEAR secret keys are `ed25519:<base58 of seed||public>`.

import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { base58Decode, base58Encode } from "./base58.ts";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface QuoteKey {
  readonly privateKey: KeyObject;
  /** `ed25519:<base58>`, the form `pontis-core.set_quote_signer` takes. */
  readonly publicKey: string;
}

export function keyFromSeed(seed: Uint8Array): QuoteKey {
  if (seed.length !== 32) throw new Error("an ed25519 seed is 32 bytes");
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const raw = Buffer.from(
    createPublicKey(privateKey).export({ format: "jwk" }).x as string,
    "base64url",
  );
  return { privateKey, publicKey: `ed25519:${base58Encode(raw)}` };
}

/** Parses a NEAR `ed25519:<base58>` secret key (64 bytes: seed then public key). */
export function parseSecretKey(encoded: string): QuoteKey {
  const [curve, body] = encoded.split(":");
  if (curve !== "ed25519" || !body) throw new Error("expected an ed25519:<base58> secret key");
  const bytes = base58Decode(body);
  if (bytes.length !== 64)
    throw new Error("an ed25519 secret key is 64 bytes (seed then public key)");
  const key = keyFromSeed(bytes.slice(0, 32));
  if (key.publicKey !== `ed25519:${base58Encode(bytes.slice(32))}`) {
    throw new Error("secret key does not match its embedded public key");
  }
  return key;
}
