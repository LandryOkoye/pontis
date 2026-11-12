// Display helpers. Amount math is bigint-only: nothing here converts an amount to a Number.
import { formatDecimalAmount, parseAmount, rationalFromWire } from "@pontis/domain";
import { config } from "./config.ts";

interface Wire {
  num: string;
  den: string;
}

/** Groups the whole part with thin separators: "1234567.5" -> "1,234,567.5". */
export function groupDigits(text: string): string {
  const [whole = "0", fraction] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Exact display text for a wire amount (smallest units) of a token with `decimals`. */
export function formatUnits(amount: string | bigint, decimals: number): string {
  const value = typeof amount === "bigint" ? amount : parseAmount(amount);
  return groupDigits(formatDecimalAmount(value, decimals));
}

/** Like `formatUnits`, but shortens long fractions for dense tables. The full value stays in a title. */
export function formatUnitsCompact(amount: string | bigint, decimals: number, maxFraction = 4) {
  const text = formatUnits(amount, decimals);
  const [whole = "0", fraction] = text.split(".");
  if (!fraction || fraction.length <= maxFraction) return text;
  return `${whole}.${fraction.slice(0, maxFraction)}…`;
}

/** 10^n as bigint. */
export const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * How many whole `to` tokens one whole `from` token converts to, as exact text.
 * `ratio` is output smallest units per input smallest unit.
 */
export function wholeTokenRate(ratio: Wire, fromDecimals: number, toDecimals: number): string {
  const r = rationalFromWire(ratio);
  // one whole `from` = 10^fromDecimals smallest units -> out smallest units, shown with toDecimals.
  const outSmallest = (pow10(fromDecimals) * r.num) / r.den;
  return groupDigits(formatDecimalAmount(outSmallest, toDecimals));
}

/** "1/1000000" style text for a rational, with grouping. */
export function ratioText(r: Wire): string {
  return r.den === "1" ? groupDigits(r.num) : `${groupDigits(r.num)} / ${groupDigits(r.den)}`;
}

/** Canonical units held, floor, as text: amount * multiplier. */
export function canonicalUnits(amount: string, multiplier: Wire): string {
  const m = rationalFromWire(multiplier);
  const scaled = (parseAmount(amount) * m.num * 100n) / m.den;
  return groupDigits(formatDecimalAmount(scaled, 2));
}

export function bpsText(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = String(bps % 100).padStart(2, "0");
  return `${whole}.${frac}%`;
}

export function shortId(id: string, head = 6, tail = 4): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function shortAccount(account: string, max = 22): string {
  if (account.length <= max) return account;
  const dot = account.lastIndexOf(".");
  const suffix = dot > 0 ? account.slice(dot) : "";
  return `${account.slice(0, max - suffix.length - 1)}…${suffix}`;
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export const formatDate = (iso: string): string => DATE.format(new Date(iso));
export const formatDateTime = (iso: string): string =>
  `${DATE.format(new Date(iso))} · ${TIME.format(new Date(iso))} UTC`;

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const explorer = {
  tx: (hash: string) => `${config.explorerUrl}/txns/${hash}`,
  account: (id: string) => `${config.explorerUrl}/address/${id}`,
};
