// Which representations have custody, with whom, and the reserve story each tells (ADR 0020).
// Fiction: nothing is custodied or backed, every attestation is simulated. Some representations
// have NO row on purpose (a share, an index tracker, an art piece, assets of unverified issuers) so
// the custody screens show their empty state.

import {
  type CustodyStructure,
  type CustodyTier,
  type PlannedCustody,
  type ReserveStory,
} from "./catalogue-custody-types.ts";

const DAY_MS = 86_400_000;

/** The policy and default cover of each story; `healthy` states its own cover (100 to 110 percent). */
export const STORY_PRESETS: Record<
  ReserveStory,
  {
    action: PlannedCustody["policy"]["action"];
    toleranceBps: number;
    maxReserveAgeMs: number;
    coverBps: number | null;
  }
> = {
  healthy: {
    action: "restrict_conversions",
    toleranceBps: 0,
    maxReserveAgeMs: DAY_MS,
    coverBps: 10_000,
  },
  thin: {
    action: "restrict_conversions",
    toleranceBps: 100,
    maxReserveAgeMs: DAY_MS,
    coverBps: 9_950,
  },
  breached: {
    action: "restrict_conversions",
    toleranceBps: 0,
    maxReserveAgeMs: DAY_MS,
    coverBps: 9_200,
  },
  stale: {
    action: "restrict_conversions",
    toleranceBps: 0,
    maxReserveAgeMs: 300_000,
    coverBps: 10_000,
  },
  warn_only: { action: "warn", toleranceBps: 0, maxReserveAgeMs: DAY_MS, coverBps: 9_700 },
  pause_mint: { action: "pause_mint", toleranceBps: 50, maxReserveAgeMs: DAY_MS, coverBps: 10_100 },
  never_attested: {
    action: "restrict_conversions",
    toleranceBps: 0,
    maxReserveAgeMs: DAY_MS,
    coverBps: null,
  },
};

export const NQ = "northquay-custody-sim";
export const LH = "lindenhall-vaults-sim";
export const OB = "orrinvale-bullion-sim";
export const QF = "ferncliff-vault-sim";
export const MG = "mossgrove-registry-sim";

export function row(
  tier: CustodyTier,
  representationId: string,
  custodianId: string,
  structure: CustodyStructure,
  story: ReserveStory,
  options: { coverBps?: number; gatedMint?: boolean } = {},
): PlannedCustody {
  const { coverBps, ...policy } = STORY_PRESETS[story];
  return {
    representationId,
    tier,
    custodianId,
    structure,
    story,
    policy,
    coverBps: coverBps === null ? null : (options.coverBps ?? coverBps),
    gatedMint: options.gatedMint ?? false,
  };
}

/** The demo tier's small custody set; the rest is in catalogue-custody-reps-full.ts. */
export const DEMO_CUSTODY: readonly PlannedCustody[] = [
  row("demo", "ttb3m-m", NQ, "segregated", "thin", { gatedMint: true }),
  row("demo", "tmmfusd-m", NQ, "omnibus", "healthy", { coverBps: 10_200 }),
  row("demo", "tgkg-a", LH, "segregated", "healthy", { coverBps: 10_500 }),
  row("demo", "tgkg-d", OB, "omnibus", "breached"),
  row("demo", "teur-m", QF, "on_chain_vault", "stale"),
  row("demo", "tcbn-v", MG, "segregated", "healthy", { coverBps: 10_100 }),
];
