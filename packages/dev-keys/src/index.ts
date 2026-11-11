// Dev-only keystore (expansion brief section 0.10). Every key here is derived from a public label,
// so anyone can recompute it: it can sign simulated price points and test attestations, and it
// must never hold or control anything of value. Production-style secrets go through the signer
// abstraction instead (phase 7).

import { createHash } from "node:crypto";
import { keyFromSeed, type QuoteKey } from "@pontis/quote-engine";

/** Roles that have a simulated key. Each later workstream adds its own. */
export const DEV_KEY_ROLES = ["price-publisher"] as const;
export type DevKeyRole = (typeof DEV_KEY_ROLES)[number];

const DOMAIN = "pontis-dev-key-v1";

/** The same key for the same role on every machine. */
export function devKey(role: DevKeyRole): QuoteKey {
  const seed = createHash("sha256").update(`${DOMAIN}:${role}`).digest();
  return keyFromSeed(seed);
}
