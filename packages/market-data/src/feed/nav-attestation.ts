// Signed NAV strikes (ADR 0018 section 4). The same publisher key and conventions as the price
// attestation, a different domain so a price signature can never be replayed as a strike:
// `b"pontis-nav-v1" ++ borsh(payload)`, rebuilt by `submit_nav_strike` on chain.
// `test-vectors/nav-strike.json` pins the layout for TypeScript, Python and the contract's reading.

import { sign } from "node:crypto";
import { U128_MAX } from "@pontis/domain";
import type { QuoteKey } from "@pontis/quote-engine";
import { le, str } from "./borsh.ts";
import type { NavPoint } from "./types.ts";

export const NAV_ATTESTATION_DOMAIN = "pontis-nav-v1";
export const NAV_ATTESTATION_VERSION = 1;

/** A strike: the NAV and the window `[asOfMs, cutoffMs)` in which a fund may convert at it. */
export interface NavStrikePoint extends NavPoint {
  cutoffMs: number;
}

function ms(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} outside the supported range`);
  }
  return BigInt(value);
}

/** The exact bytes a publisher signs for `strike` on `contract`. */
export function navStrikeMessage(strike: NavStrikePoint, contract: string): Buffer {
  if (strike.nav < 0n || strike.nav > U128_MAX) throw new RangeError("nav outside u128");
  return Buffer.concat([
    Buffer.from(NAV_ATTESTATION_DOMAIN, "utf8"),
    Buffer.from([NAV_ATTESTATION_VERSION]),
    str(contract),
    str(strike.representationId),
    le(strike.nav, 16),
    str(strike.currency),
    le(ms(strike.asOfMs, "asOfMs"), 8),
    le(ms(strike.cutoffMs, "cutoffMs"), 8),
    Buffer.from([strike.simulated ? 1 : 0]),
    str(strike.source),
  ]);
}

/** The arguments of `submit_nav_strike`: what a relayer sends, nothing else. */
export function submitNavStrikeArgs(strike: NavStrikePoint, key: QuoteKey, contract: string) {
  return {
    attestation: {
      version: NAV_ATTESTATION_VERSION,
      contract,
      representation_id: strike.representationId,
      nav: strike.nav.toString(),
      currency: strike.currency,
      as_of_ms: strike.asOfMs,
      cutoff_ms: strike.cutoffMs,
      simulated: strike.simulated,
      source: strike.source,
    },
    signature: sign(null, navStrikeMessage(strike, contract), key.privateKey).toString("base64"),
    public_key: key.publicKey,
  };
}
