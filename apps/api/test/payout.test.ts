import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_PAYOUT_BYTES, payoutInstructionHash } from "../src/custody/payout.ts";
import { errorCodeOf } from "./helpers.ts";

describe("payoutInstructionHash", () => {
  it("is plain SHA-256 of the decoded ciphertext (vector computed with Python hashlib)", () => {
    // python3 -c "import hashlib;print(hashlib.sha256(bytes(range(32))).hexdigest())"
    expect(payoutInstructionHash("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")).toBe(
      "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd",
    );
    // python3 -c "import hashlib;print(hashlib.sha256(b'\xff').hexdigest())"
    expect(payoutInstructionHash("/w==")).toBe(
      "a8100ae6aa1940d0b663bb31cd466142ebbdbd5187131b92d93818987832eb89",
    );
  });

  it("hashes the bytes, not the text: another encoding of the same bytes is refused, not hashed apart", async () => {
    // "/x==" decodes to 0xff too but is not canonical (the trailing bits are not zero).
    expect(await errorCodeOf(Promise.resolve().then(() => payoutInstructionHash("/x==")))).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("accepts up to 4096 bytes and refuses more, and refuses empty input", async () => {
    const at = Buffer.alloc(MAX_PAYOUT_BYTES, 7).toString("base64");
    expect(payoutInstructionHash(at)).toBe(
      createHash("sha256").update(Buffer.alloc(MAX_PAYOUT_BYTES, 7)).digest("hex"),
    );
    const over = Buffer.alloc(MAX_PAYOUT_BYTES + 1, 7).toString("base64");
    expect(await errorCodeOf(Promise.resolve().then(() => payoutInstructionHash(over)))).toBe(
      "VALIDATION_ERROR",
    );
    expect(await errorCodeOf(Promise.resolve().then(() => payoutInstructionHash("")))).toBe(
      "VALIDATION_ERROR",
    );
  });
});
