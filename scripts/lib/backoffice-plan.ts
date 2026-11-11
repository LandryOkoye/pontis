// The simulated issuer back-office's decision rule (ADR 0020 section 7): which action, if any, to
// take on a redemption right now. Pure: no chain, no clock, so it is tested directly. SIMULATED:
// the "receipt" it files is a synthetic string, nothing is paid out and no fiat or custody
// transfer happens.

import { createHash } from "node:crypto";

/** The fields of a contract `Redemption` the plan reads (`u64` times are JSON numbers). */
export interface RedemptionView {
  id: number;
  representation_id: string;
  amount: string;
  status: string;
  created_ms: number;
  accept_deadline_ms: number;
  accepted_ms: number | null;
  fulfil_deadline_ms: number | null;
}

export interface BackofficeDelays {
  /** Wait this long after `created_ms` before accepting. */
  acceptAfterMs: number;
  /** Wait this long after `accepted_ms` before fulfilling. */
  fulfilAfterMs: number;
}

export type BackofficeStep =
  | { kind: "accept"; id: number; representationId: string }
  | { kind: "fulfil"; id: number; representationId: string; evidenceHash: string };

/** The sha256 hex of a synthetic receipt text for `redemption`: deterministic, so a retry repeats it. */
export function syntheticReceiptHash(redemption: RedemptionView): string {
  const receipt = `SIMULATED fulfilment receipt: redemption ${redemption.id}, ${redemption.representation_id}, ${redemption.amount} units`;
  return createHash("sha256").update(receipt).digest("hex");
}

/**
 * The step to take on `redemption` at `nowMs`, or `null`. A redemption in `ignore` is never
 * touched, so it runs into its deadline and expires. The back-office also stays away from a
 * deadline it has already missed: the contract would refuse, and the user reclaims instead.
 */
export function stepFor(
  redemption: RedemptionView,
  delays: BackofficeDelays,
  ignore: ReadonlySet<number>,
  nowMs: number,
): BackofficeStep | null {
  if (ignore.has(redemption.id)) return null;
  const representationId = redemption.representation_id;
  if (redemption.status === "requested") {
    const due = redemption.created_ms + delays.acceptAfterMs;
    if (nowMs >= due && nowMs <= redemption.accept_deadline_ms) {
      return { kind: "accept", id: redemption.id, representationId };
    }
  } else if (redemption.status === "accepted") {
    if (redemption.accepted_ms === null || redemption.fulfil_deadline_ms === null) return null;
    const due = redemption.accepted_ms + delays.fulfilAfterMs;
    if (nowMs >= due && nowMs <= redemption.fulfil_deadline_ms) {
      return {
        kind: "fulfil",
        id: redemption.id,
        representationId,
        evidenceHash: syntheticReceiptHash(redemption),
      };
    }
  }
  return null;
}

/** Every step due now, oldest redemption first. */
export function planBackoffice(
  redemptions: readonly RedemptionView[],
  delays: BackofficeDelays,
  ignore: ReadonlySet<number>,
  nowMs: number,
): BackofficeStep[] {
  const steps: BackofficeStep[] = [];
  for (const redemption of [...redemptions].sort((a, b) => a.id - b.id)) {
    const step = stepFor(redemption, delays, ignore, nowMs);
    if (step) steps.push(step);
  }
  return steps;
}
