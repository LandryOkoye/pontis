// Amount helpers. All amounts are non-negative integers in smallest units, carried as `bigint`
// in code and as decimal strings on the wire. They mirror the contract's `u128` (BuildPlan §2).
// No floating point is used anywhere in this file.

export const U128_MAX = (1n << 128n) - 1n;

/** Highest supported token `decimals`: 10^38 still fits in u128. */
export const MAX_DECIMALS = 38;

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

const INTEGER_RE = /^(0|[1-9][0-9]*)$/;
const DECIMAL_RE = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export function isU128(value: bigint): boolean {
  return value >= 0n && value <= U128_MAX;
}

/** True for a canonical decimal-integer string (no sign, no leading zeros) that fits in u128. */
export function isAmountString(value: string): boolean {
  return INTEGER_RE.test(value) && BigInt(value) <= U128_MAX;
}

/** Parses a wire amount (canonical integer string in smallest units). Throws `AmountError`. */
export function parseAmount(value: string): bigint {
  if (!INTEGER_RE.test(value)) {
    throw new AmountError(`not a canonical non-negative integer string: ${JSON.stringify(value)}`);
  }
  const amount = BigInt(value);
  if (amount > U128_MAX) throw new AmountError("amount exceeds u128");
  return amount;
}

/** Serialises an amount for the wire. Throws `AmountError` if it is negative or exceeds u128. */
export function amountToString(amount: bigint): string {
  if (!isU128(amount)) throw new AmountError("amount outside u128 range");
  return amount.toString();
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new AmountError(`decimals must be an integer in 0..${MAX_DECIMALS}`);
  }
}

/**
 * Parses user-entered display text ("1.5") into smallest units for a token with `decimals`.
 * Strict: no sign, no exponent, no thousands separators, no ".5" or "5.". Fractional digits beyond
 * `decimals` are rejected unless they are all zeros. Throws `AmountError`.
 */
export function parseDecimalAmount(input: string, decimals: number): bigint {
  assertDecimals(decimals);
  const match = DECIMAL_RE.exec(input);
  if (!match) throw new AmountError(`not a decimal amount: ${JSON.stringify(input)}`);
  const whole = match[1] as string;
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > decimals) {
    throw new AmountError(`more than ${decimals} fractional digits`);
  }
  const scaled =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (scaled > U128_MAX) throw new AmountError("amount exceeds u128");
  return scaled;
}

/** Formats smallest units as exact display text, trimming trailing fractional zeros. */
export function formatDecimalAmount(amount: bigint, decimals: number): string {
  assertDecimals(decimals);
  if (!isU128(amount)) throw new AmountError("amount outside u128 range");
  const digits = amount.toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}
