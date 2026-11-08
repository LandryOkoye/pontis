// Base58 (Bitcoin alphabet), the encoding NEAR uses for keys: `ed25519:<base58>`.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  const zeros = bytes.findIndex((b) => b !== 0);
  return "1".repeat(zeros === -1 ? bytes.length : zeros) + out;
}

export function base58Decode(text: string): Uint8Array {
  let value = 0n;
  for (const ch of text) {
    const digit = ALPHABET.indexOf(ch);
    if (digit === -1) throw new Error(`invalid base58 character: ${JSON.stringify(ch)}`);
    value = value * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  const leadingOnes = text.length - text.replace(/^1+/, "").length;
  return Uint8Array.from([...new Array<number>(leadingOnes).fill(0), ...bytes]);
}
