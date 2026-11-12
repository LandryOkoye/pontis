// NEP-413 `signMessage` (ADR 0019): the payload a wallet signs to prove it holds an access key of
// an account, off chain. The bytes are fixed by the NEP; test-vectors/nep413.json holds vectors
// computed independently of this file.
//
//   preimage  = u32 LE (2^31 + 413) ++ borsh(Payload)
//   Payload   = { message: string, nonce: [u8; 32], recipient: string, callback_url: Option<string> }
//   signature = ed25519 over sha256(preimage)  (NEAR signs hashes, not raw bytes)

import {
  createHash,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto";
import { base58Decode } from "./base58.ts";
import type { QuoteKey } from "./keys.ts";

/** 2^31 + 413: marks the bytes as a NEP-413 message, which no transaction can begin with. */
export const NEP413_TAG = 2_147_484_061;
export const NEP413_NONCE_BYTES = 32;

export interface Nep413Payload {
  message: string;
  /** Exactly 32 bytes. */
  nonce: Uint8Array;
  recipient: string;
  /** Wallets may sign over their own callback URL; it is part of the hashed bytes when present. */
  callbackUrl?: string | null | undefined;
}

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function borshString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/** The exact bytes that are hashed: tag, then the Borsh payload. */
export function nep413Preimage(payload: Nep413Payload): Buffer {
  if (payload.nonce.length !== NEP413_NONCE_BYTES) throw new Error("a NEP-413 nonce is 32 bytes");
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(NEP413_TAG);
  const callback =
    payload.callbackUrl === undefined || payload.callbackUrl === null
      ? Buffer.from([0])
      : Buffer.concat([Buffer.from([1]), borshString(payload.callbackUrl)]);
  return Buffer.concat([
    tag,
    borshString(payload.message),
    Buffer.from(payload.nonce),
    borshString(payload.recipient),
    callback,
  ]);
}

/** The 32 bytes the wallet signs. */
export function nep413Digest(payload: Nep413Payload): Buffer {
  return createHash("sha256").update(nep413Preimage(payload)).digest();
}

/** Base64 signature, the form `signMessage` returns. For tests and the dev login script. */
export function signNep413(key: QuoteKey, payload: Nep413Payload): string {
  return edSign(null, nep413Digest(payload), key.privateKey).toString("base64");
}

/** A `ed25519:<base58>` public key as a key object; throws on any other curve or a wrong length. */
export function ed25519PublicKey(publicKey: string): KeyObject {
  const [curve, body, ...rest] = publicKey.split(":");
  if (curve !== "ed25519" || !body || rest.length > 0)
    throw new Error("expected an ed25519:<base58> public key");
  const raw = base58Decode(body);
  if (raw.length !== 32) throw new Error("an ed25519 public key is 32 bytes");
  return createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

/**
 * True if `signatureBase64` is a valid ed25519 signature by `publicKey` over the digest of
 * `payload`. Malformed keys or signatures are a `false`, never an exception.
 */
export function verifyNep413(
  payload: Nep413Payload,
  publicKey: string,
  signatureBase64: string,
): boolean {
  try {
    const signature = Buffer.from(signatureBase64, "base64");
    // Buffer.from is lenient: insist the text was canonical base64 of 64 bytes.
    if (signature.length !== 64 || signature.toString("base64") !== signatureBase64) return false;
    return edVerify(null, nep413Digest(payload), ed25519PublicKey(publicKey), signature);
  } catch {
    return false;
  }
}
