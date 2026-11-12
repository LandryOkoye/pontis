// The encrypted payout instruction of a redemption (ADR 0020 sections 7 and 10). The client
// encrypts it and sends base64; the API checks the encoding and the size, hashes the decoded bytes,
// and stores the text as sent. It never decrypts, parses or logs it, and nothing returns it.

import { createHash } from "node:crypto";
import { AppError } from "../errors.ts";

/** Decoded size bounds: a ciphertext is never empty, and 4 KiB is room for any address or note. */
export const MAX_PAYOUT_BYTES = 4096;

/**
 * SHA-256 of the ciphertext bytes, as 64 lowercase hex characters: the `payout_instruction_hash`
 * of the `redeem:` message. The hash covers the ciphertext, not the base64 text, so two encodings
 * of the same bytes cannot produce two hashes; non-canonical base64 is refused for that reason.
 */
export function payoutInstructionHash(base64: string): string {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== base64) {
    throw new AppError("VALIDATION_ERROR", 400, "payoutInstruction must be canonical base64");
  }
  if (bytes.length > MAX_PAYOUT_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `payoutInstruction is at most ${MAX_PAYOUT_BYTES} bytes before encoding`,
    );
  }
  return createHash("sha256").update(bytes).digest("hex");
}
