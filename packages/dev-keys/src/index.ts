// Dev-only keystore (expansion brief section 0.10). Every key here is derived from a public label,
// so anyone can recompute it: it can sign simulated price points and test attestations, and it
// must never hold or control anything of value. Production-style secrets go through the signer
// abstraction instead (phase 7).

import { createHash } from "node:crypto";
import { base58Decode, base58Encode, keyFromSeed, type QuoteKey } from "@pontis/quote-engine";

/**
 * Roles that have a simulated key. Each later workstream adds its own. `reserve-attester` signs
 * the simulated custodian's reserve attestations (ADR 0020); `issuer-backoffice` is the key of the
 * simulated issuer back-office account.
 */
export const DEV_KEY_ROLES = ["price-publisher", "reserve-attester", "issuer-backoffice"] as const;
export type DevKeyRole = (typeof DEV_KEY_ROLES)[number];

const DOMAIN = "pontis-dev-key-v1";

function seedOf(role: DevKeyRole): Buffer {
  return createHash("sha256").update(`${DOMAIN}:${role}`).digest();
}

/** The same key for the same role on every machine. */
export function devKey(role: DevKeyRole): QuoteKey {
  return keyFromSeed(seedOf(role));
}

/**
 * The role's key as a NEAR secret key (`ed25519:<base58 of seed then public key>`), for signing
 * transactions as a testnet account that has the matching public key added. Public by construction.
 */
export function devSecretKey(role: DevKeyRole): string {
  const publicBytes = base58Decode(devKey(role).publicKey.slice("ed25519:".length));
  return `ed25519:${base58Encode(Buffer.concat([seedOf(role), publicBytes]))}`;
}
