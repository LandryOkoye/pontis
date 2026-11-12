// Turns the custody data (catalogue-custody-*.ts) into the exact arguments of the contract calls,
// through the same argument builders the operator commands use (reserve-ops.ts), so the seed and
// `pnpm reserves` can never disagree on a call's shape. Pure: no chain, no clock, no files.
// Everything is SIMULATED: the custodians, the reserves and the redemptions are fiction.

import { createHash } from "node:crypto";
import { devKey } from "@pontis/dev-keys";
import type {
  PlannedCustodian,
  PlannedCustody,
  PlannedRedemption,
  PlannedTerms,
} from "./catalogue-custody-types.ts";
import {
  addSignerKeyArgs,
  linkCustodyArgs,
  registerCustodianArgs,
  setReservePolicyArgs,
} from "./reserve-ops.ts";

/** The `reserve_attester` role holder; never the registrar (the deployer), and it signs nothing itself. */
export function attesterAccountId(deployerId: string): string {
  return `custodian-sim.${deployerId}`;
}

export const attesterKeyArgs = (deployerId: string) =>
  addSignerKeyArgs({
    kind: "register-attester",
    accountId: attesterAccountId(deployerId),
    scopes: ["reserves"],
  });

/** `register_custodian`: unverified, no evidence, the dev reserve-attester key. */
export const custodianArgs = (c: PlannedCustodian) =>
  registerCustodianArgs({
    kind: "register-custodian",
    id: c.id,
    name: c.name,
    jurisdiction: c.jurisdiction,
    attesterKey: devKey("reserve-attester").publicKey,
    verification: "unverified",
    evidence: [],
  });

export const linkArgs = (row: PlannedCustody) =>
  linkCustodyArgs({
    kind: "link",
    representationId: row.representationId,
    structure: row.structure,
    custodianIds: [row.custodianId],
  });

/** `set_reserve_policy`; `baselineSupply` is the token's supply now (or the policy's, on an update). */
export const policyArgs = (row: PlannedCustody, baselineSupply: bigint) =>
  setReservePolicyArgs({
    kind: "set-policy",
    representationId: row.representationId,
    policy: {
      tolerance_bps: row.policy.toleranceBps,
      max_reserve_age_ms: row.policy.maxReserveAgeMs,
      action: row.policy.action,
      baseline_supply: baselineSupply.toString(),
    },
  });

/** `set_redemption_terms`: whole tokens scaled by the token's decimals. */
export function termsArgs(t: PlannedTerms, decimals: number) {
  const unit = 10n ** BigInt(decimals);
  return {
    representation_id: t.representationId,
    terms: {
      min_amount: (t.minWhole * unit).toString(),
      max_amount: (t.maxWhole * unit).toString(),
      fee_bps: t.feeBps,
      window_anchor_ms: t.window?.anchorMs ?? 0,
      window_length_ms: t.window?.lengthMs ?? 0,
      window_period_ms: t.window?.periodMs ?? 0,
      accept_within_ms: t.acceptWithinMs,
      settlement_days: t.settlementDays,
    },
  };
}

/** A synthetic payout instruction's sha256: deterministic, so a repeated seed finds its redemption. */
export function payoutInstructionHash(r: PlannedRedemption): string {
  return createHash("sha256")
    .update(`SIMULATED payout instruction: ${r.representationId}, ${r.state}, ${r.amountWhole}`)
    .digest("hex");
}

/** The `ft_transfer_call` message that requests a redemption (redemption.rs `parse_msg`). */
export const redeemMessage = (termsHash: string, payoutHash: string) =>
  `redeem:${termsHash}:${payoutHash}`;
