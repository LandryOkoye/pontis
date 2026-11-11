// Types of the fictional custody, reserve and redemption data of the demo catalogue (ADR 0020,
// docs/progress/phase-4-seed.md). EVERYTHING here is fiction: every custodian name is invented,
// every jurisdiction is a plain fact about where a fictional firm would sit, every figure is
// simulated, and nothing is custodied, backed, audited, regulated or paid out. The seed writes
// these records through the same contract methods and the same simulated custodian signer the
// operator commands use (scripts/reserves.ts, scripts/backoffice.ts).

import type { CustodyStructure, ReserveAction } from "./reserve-ops.ts";

/** The smallest tier that includes an entry: `demo` is in `demo` and `full`, `full` only in `full`. */
export type CustodyTier = "demo" | "full";

/**
 * The contract's validation limits, copied from the Rust (the authority) so a plan is checked
 * against them without a chain: custody_types.rs, reserve_types.rs, redemption_types.rs.
 */
export const CONTRACT_LIMITS = {
  maxCustodiansPerLink: 4,
  maxToleranceBps: 1_000,
  minReserveAgeMs: 60_000,
  maxReserveAgeMs: 2_592_000_000,
  maxFeeBps: 1_000,
  minAcceptWithinMs: 1_000,
  maxAcceptWithinMs: 2_592_000_000,
  maxSettlementDays: 30,
} as const;

export type { CustodyStructure };

/** An invented custodian. Always `synthetic`, never `issuer_attested` or better: it has no evidence. */
export interface PlannedCustodian {
  id: string;
  name: string;
  /** A real place, as a plain fact about where the fictional firm would sit. */
  jurisdiction: string;
  /** What kind of firm it plays, for the dossiers and the runbook. */
  kind: string;
  tier: CustodyTier;
}

export function includesTier(tier: "mvp" | CustodyTier, entry: CustodyTier): boolean {
  return tier === "full" || (tier === "demo" && entry === "demo");
}

/**
 * The reserve story a representation tells (ADR 0020 section 5). Each is reached with the
 * contract's own mechanisms: a policy, and the cover the simulated custodian attests at.
 *
 *   healthy         attested 100 to 110 percent of supply: state `ok`
 *   thin            attested a little under supply but inside the tolerance: state `ok`, no headroom
 *   breached        attested below supply and the tolerance: route restricted (`reserve_restricted`)
 *   stale           attested once with a short max age: `ok` for minutes, then route restricted
 *                   (`reserve_stale`) until a new attestation. The story decays by design.
 *   warn_only       attested below supply, but the policy action is `warn`: flagged, nothing refused
 *   pause_mint      policy action `pause_mint`: a breach also stops gated mints
 *   never_attested  policy and link, no attestation: state `no_attestation`, route restricted
 */
export const RESERVE_STORIES = [
  "healthy",
  "thin",
  "breached",
  "stale",
  "warn_only",
  "pause_mint",
  "never_attested",
] as const;
export type ReserveStory = (typeof RESERVE_STORIES)[number];

/** A representation's custody link and reserve policy, with the cover the simulator attests at. */
export interface PlannedCustody {
  representationId: string;
  tier: CustodyTier;
  custodianId: string;
  structure: CustodyStructure;
  story: ReserveStory;
  policy: { action: ReserveAction; toleranceBps: number; maxReserveAgeMs: number };
  /** Cover the simulated custodian attests at, in basis points of supply; `null`: never attests. */
  coverBps: number | null;
  /** Makes pontis-core the token's only minter (the redemption burn needs it, ADR 0020 section 6). */
  gatedMint: boolean;
}

/** A redemption window: open while `(now - anchorMs) mod periodMs < lengthMs` (redemption_terms.rs). */
export interface PlannedWindow {
  anchorMs: number;
  lengthMs: number;
  periodMs: number;
}

/** Redemption terms of a representation, in whole tokens (the plan scales by the token's decimals). */
export interface PlannedTerms {
  representationId: string;
  tier: CustodyTier;
  minWhole: bigint;
  /** 0 means no maximum. */
  maxWhole: bigint;
  feeBps: number;
  /** `null`: always open. */
  window: PlannedWindow | null;
  acceptWithinMs: number;
  settlementDays: number;
}

export const REDEMPTION_STATES = ["requested", "accepted", "fulfilled"] as const;
export type RedemptionState = (typeof REDEMPTION_STATES)[number];

/**
 * A simulated redemption the seed leaves in a given state, through the same calls a user and the
 * simulated issuer back-office make. Nothing is paid out: the issuer is a test account.
 */
export interface PlannedRedemption {
  representationId: string;
  tier: CustodyTier;
  state: RedemptionState;
  amountWhole: bigint;
}
