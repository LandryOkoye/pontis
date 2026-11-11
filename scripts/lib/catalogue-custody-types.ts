// Types of the fictional custody, reserve and redemption data of the demo catalogue (ADR 0020,
// docs/progress/phase-4-seed.md). EVERYTHING here is fiction: every custodian name is invented,
// every jurisdiction is a plain fact about where a fictional firm would sit, every figure is
// simulated, and nothing is custodied, backed, audited, regulated or paid out. The seed writes
// these records through the same contract methods and the same simulated custodian signer the
// operator commands use (scripts/reserves.ts, scripts/backoffice.ts).

import type { CustodyStructure } from "./reserve-ops.ts";

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
