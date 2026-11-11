// Simulated market behaviour for the demo catalogue (expansion brief section 12.6). Claim IDs are
// the canonical asset IDs the seed registers. Everything here is fiction.

import type { ClaimProfile } from "./series.ts";
import type { RepresentationProfile, SimulatedFeedConfig } from "./simulated-feed.ts";

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

export const DEFAULT_CLAIMS: Readonly<Record<string, ClaimProfile>> = {
  // One troy ounce of fictional gold: a plain walk of about 1% a day.
  "syn-gold-oz": {
    seed: "syn-gold-oz",
    startPrice: "2650",
    driftPpm: 1,
    volPpm: 600,
    premium: { volPpm: 150, reversionPpm: 30_000, maxPpm: 8_000 },
    jumps: [],
  },
  // A fictional listed company, with a cash dividend on its ex-date.
  "syn-acme": {
    seed: "syn-acme",
    startPrice: "184.2",
    driftPpm: 2,
    volPpm: 1_200,
    premium: { volPpm: 300, reversionPpm: 20_000, maxPpm: 15_000 },
    jumps: [{ atMs: day(2026, 10, 2), num: 994n, den: 1_000n, reason: "cash dividend 0.6%" }],
  },
  // A fictional Treasury fund: NAV accrues about 4.5% a year, the market price tracks it closely.
  "syn-ustb": {
    seed: "syn-ustb",
    startPrice: "1",
    driftPpm: 0,
    volPpm: 0,
    navAccrualPpb: 428,
    premium: { volPpm: 60, reversionPpm: 60_000, maxPpm: 4_000 },
    jumps: [],
  },
  // A single fictional property: an appraisal-driven price that moves little between appraisals.
  "syn-villa": {
    seed: "syn-villa",
    startPrice: "1250000",
    driftPpm: 0,
    volPpm: 25,
    premium: { volPpm: 80, reversionPpm: 10_000, maxPpm: 30_000 },
    jumps: [{ atMs: day(2026, 9, 30), num: 1_024n, den: 1_000n, reason: "appraisal +2.4%" }],
  },
  // A fictional private-credit note, accruing about 7% a year toward maturity.
  "syn-credit": {
    seed: "syn-credit",
    startPrice: "100",
    driftPpm: 0,
    volPpm: 0,
    navAccrualPpb: 666,
    premium: { volPpm: 120, reversionPpm: 30_000, maxPpm: 12_000 },
    jumps: [],
  },
  // A fictional dollar-pegged quote asset.
  "syn-usd": {
    seed: "syn-usd",
    startPrice: "1",
    driftPpm: 0,
    volPpm: 12,
    peg: { target: "1", reversionPpm: 100_000 },
    premium: { volPpm: 20, reversionPpm: 100_000, maxPpm: 2_000 },
    jumps: [],
  },
  // A fictional listed company with a stock split announced but not yet applied.
  "syn-nova": {
    seed: "syn-nova",
    startPrice: "42.8",
    driftPpm: 3,
    volPpm: 1_500,
    premium: { volPpm: 350, reversionPpm: 20_000, maxPpm: 18_000 },
    jumps: [],
  },
};

export interface RegistryRepresentation {
  id: string;
  canonicalAssetId: string;
  decimals: number;
  /** Canonical units per smallest token unit, as stored in the registry. */
  unitMultiplier: { num: bigint; den: bigint };
}

/** Feed config for every registry representation whose claim has a default profile. */
export function feedConfigFor(
  reps: readonly RegistryRepresentation[],
  claims: Readonly<Record<string, ClaimProfile>> = DEFAULT_CLAIMS,
): SimulatedFeedConfig {
  const representations: Record<string, RepresentationProfile> = {};
  for (const rep of reps) {
    if (!claims[rep.canonicalAssetId]) continue;
    representations[rep.id] = {
      claimId: rep.canonicalAssetId,
      canonicalPerToken: {
        num: rep.unitMultiplier.num * 10n ** BigInt(rep.decimals),
        den: rep.unitMultiplier.den,
      },
    };
  }
  return { claims, representations };
}
