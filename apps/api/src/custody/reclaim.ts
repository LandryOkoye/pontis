// POST /v1/redemptions/{id}/reclaim-intent (ADR 0020 sections 7 and 10): the redeemer's exit.
// Built only when the chain's record says the escrow is reclaimable; the contract decides when
// the transaction runs. The API never signs or sends it.

import type { RedemptionIntent } from "@pontis/api-types";
import { reclaimRedemptionAction } from "@pontis/near-client";
import { AppError } from "../errors.ts";
import { conflict, loadRedemption, redemptionIntent, type IntentDeps } from "./intent-context.ts";
import { isReclaimable } from "./redemptions.ts";

/** Only the redemption's own account may reclaim; the escrow goes back to it. */
export async function reclaimIntent(deps: IntentDeps, id: string): Promise<RedemptionIntent> {
  const r = await loadRedemption(deps, id);
  if (r.user !== deps.caller.accountId) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "Only the account that requested a redemption can reclaim it",
    );
  }
  if (!isReclaimable(r, deps.now.getTime())) {
    throw conflict(
      r.settling
        ? "A token call for this redemption is still in flight"
        : `A ${r.status} redemption is not reclaimable: only rejected or expired ones, or ones past their deadline`,
    );
  }
  return redemptionIntent(r, "reclaim", reclaimRedemptionAction(deps.coreId, id));
}
