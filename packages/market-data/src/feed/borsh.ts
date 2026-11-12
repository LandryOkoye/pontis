// The two Borsh pieces the signed attestations need; everything else is a fixed-width integer.

/** Unsigned integer of `bytes` bytes, little-endian. */
export function le(value: bigint, bytes: number): Buffer {
  const out = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) out[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  return out;
}

/** Borsh string: u32 little-endian length, then UTF-8. */
export function str(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  return Buffer.concat([le(BigInt(body.length), 4), body]);
}
