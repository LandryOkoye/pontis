// Integer helpers for custody, reserves and redemption (ADR 0020). Everything here mirrors a rule
// the contract enforces, so the API can show what the contract will do without a second opinion.

/** The enforced redemption window of ADR 0020 section 7; times are milliseconds since epoch. */
export interface RedemptionWindow {
  readonly anchorMs: number;
  readonly lengthMs: number;
  /** 0 means the window is always open. */
  readonly periodMs: number;
}

/** Open when `period == 0`, or `now >= anchor` and `((now - anchor) mod period) < length`. */
export function redemptionWindowOpen(w: RedemptionWindow, nowMs: number): boolean {
  if (w.periodMs === 0) return true;
  if (nowMs < w.anchorMs) return false;
  return (nowMs - w.anchorMs) % w.periodMs < w.lengthMs;
}

/** When the window next opens, or null while it is open or because it never closes. */
export function nextRedemptionWindowMs(w: RedemptionWindow, nowMs: number): number | null {
  if (w.periodMs === 0 || redemptionWindowOpen(w, nowMs)) return null;
  if (nowMs < w.anchorMs) return w.anchorMs;
  return w.anchorMs + (Math.floor((nowMs - w.anchorMs) / w.periodMs) + 1) * w.periodMs;
}

/** `fee = ceil(amount * fee_bps / 10_000)`; what the issuer keeps, owed off-chain (ADR 0020 section 7). */
export function redemptionFee(amount: bigint, feeBps: number): { fee: bigint; net: bigint } {
  const product = amount * BigInt(feeBps);
  const fee = (product + 9_999n) / 10_000n;
  return { fee, net: amount - fee };
}

/** `floor(part * 10_000 / whole)` in basis points; null when `whole` is zero. */
export function ratioBps(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  return Number((part * 10_000n) / whole);
}

/** Basis points as a percentage with two decimals and no float arithmetic: 10050 gives "100.50". */
export function formatBpsPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = (bps % 100).toString().padStart(2, "0");
  return `${whole}.${frac}`;
}
