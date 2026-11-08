// Quote signing (ADR 0006): the backend signs `b"pontis-quote-v1" ++ borsh(payload)` with the
// quote-signer key and the contract rebuilds the same bytes from the JSON fields in `msg`.
// Pinned by test-vectors/quote-signing.json, built independently in Rust (and re-derived in Python).

import { randomBytes, sign } from "node:crypto";
import { U128_MAX } from "@pontis/domain";
import type { QuoteKey } from "./keys.ts";

export const QUOTE_DOMAIN = "pontis-quote-v1";
export const QUOTE_VERSION = 1;

export interface QuoteFields {
  readonly version: number;
  readonly contract: string;
  readonly user: string;
  readonly tokenIn: string;
  readonly tokenOut: string;
  readonly amountIn: bigint;
  readonly amountOutGross: bigint;
  readonly fee: bigint;
  readonly amountOut: bigint;
  readonly feeBps: number;
  readonly expiresAtMs: number;
  /** 32 lowercase hex characters (16 bytes); the on-chain operation ID. */
  readonly nonce: string;
  readonly compatibilityVersion: number;
  readonly policyVersion: number;
}

const NONCE_RE = /^[0-9a-f]{32}$/;

export const newNonce = (): string => randomBytes(16).toString("hex");

function le(value: bigint, bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) out[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  return out;
}

function u128(value: bigint): Buffer {
  if (value < 0n || value > U128_MAX) throw new RangeError("amount outside u128");
  return le(value, 16);
}

function uint(value: number, bytes: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** (8 * Math.min(bytes, 6))) {
    throw new RangeError(`value outside the supported u${8 * bytes} range`);
  }
  return le(BigInt(value), bytes);
}

/** Borsh string: u32 little-endian length, then UTF-8. */
function str(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([le(BigInt(body.length), 4), body]);
}

/** The exact bytes that are signed. */
export function quoteMessage(q: QuoteFields): Uint8Array {
  if (!NONCE_RE.test(q.nonce)) throw new Error("nonce must be 32 lowercase hex characters");
  return Buffer.concat([
    Buffer.from(QUOTE_DOMAIN),
    uint(q.version, 1),
    str(q.contract),
    str(q.user),
    str(q.tokenIn),
    str(q.tokenOut),
    u128(q.amountIn),
    u128(q.amountOutGross),
    u128(q.fee),
    u128(q.amountOut),
    uint(q.feeBps, 2),
    uint(q.expiresAtMs, 8),
    Buffer.from(q.nonce, "hex"),
    uint(q.compatibilityVersion, 8),
    uint(q.policyVersion, 8),
  ]);
}

export interface SignedQuote {
  readonly message: Uint8Array;
  readonly signature: Uint8Array;
  /** Standard base64: the `signature` field of the `ft_transfer_call` message. */
  readonly signatureBase64: string;
}

export function signQuote(key: QuoteKey, q: QuoteFields): SignedQuote {
  const message = quoteMessage(q);
  const signature = sign(null, message, key.privateKey);
  return { message, signature, signatureBase64: signature.toString("base64") };
}

/** The `quote` object of the `ft_transfer_call` message, as `pontis-core` parses it. */
export function toChainQuote(q: QuoteFields): Record<string, unknown> {
  return {
    version: q.version,
    contract: q.contract,
    user: q.user,
    token_in: q.tokenIn,
    token_out: q.tokenOut,
    amount_in: q.amountIn.toString(),
    amount_out_gross: q.amountOutGross.toString(),
    fee: q.fee.toString(),
    amount_out: q.amountOut.toString(),
    fee_bps: q.feeBps,
    expires_at_ms: q.expiresAtMs,
    nonce: q.nonce,
    compatibility_version: q.compatibilityVersion,
    policy_version: q.policyVersion,
  };
}
