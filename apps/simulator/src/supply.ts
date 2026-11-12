// Simulated circulating supply: a start per claim that grows slowly with a little daily jitter.
// Deterministic, so a rerun writes the same snapshots.

import { seedFrom } from "@pontis/market-data";
import { RICH_DAILY_GROWTH_PPM, RICH_START_SUPPLY_TOKENS } from "./supply-rich.ts";

/** Whole tokens in circulation at the start of the simulation, per canonical asset ID. */
export const START_SUPPLY_TOKENS: Readonly<Record<string, bigint>> = {
  "syn-gold-oz": 12_000n,
  "syn-acme": 2_500_000n,
  "syn-ustb": 80_000_000n,
  "syn-villa": 1n,
  "syn-credit": 4_000_000n,
  "syn-usd": 500_000_000n,
  "syn-nova": 1_200_000n,
  ...RICH_START_SUPPLY_TOKENS,
};

/** Daily growth in ppm of the start; claims not listed in the rich table grow by this much. */
const DEFAULT_GROWTH_PPM = 2_000;

const DAY_MS = 86_400_000;
const ANCHOR_DAY = Math.floor(Date.UTC(2026, 6, 1) / DAY_MS);

/** Supply in smallest units at the start of the UTC day `dayIndex`; null for an unknown claim. */
export function supplyOnDay(
  claimId: string,
  representationId: string,
  decimals: number,
  dayIndex: number,
): bigint | null {
  const start = START_SUPPLY_TOKENS[claimId];
  // A single-unit asset (one property) does not grow.
  if (start === undefined) return null;
  const growth = BigInt(RICH_DAILY_GROWTH_PPM[claimId] ?? DEFAULT_GROWTH_PPM);
  const grown = start === 1n ? 0n : BigInt(dayIndex - ANCHOR_DAY) * growth;
  const jitter = BigInt(seedFrom(`${representationId}:${dayIndex}`) % 10_000);
  // A shrinking claim stops at zero rather than going negative.
  const factor = 1_000_000n + grown + jitter * (start === 1n ? 0n : 1n);
  return (start * 10n ** BigInt(decimals) * (factor > 0n ? factor : 0n)) / 1_000_000n;
}
