// The issuer back-office's accept, reject and fulfil (ADR 0020 sections 7 and 10), as unsigned
// actions under the contract's status, deadline and settling rules. The caller must be a
// back-office account of the representation's active issuer. The API signs and sends nothing.

import type { RedemptionIntent } from "@pontis/api-types";
import {
  acceptRedemptionAction,
  fulfilRedemptionAction,
  rejectRedemptionAction,
} from "@pontis/near-client";
import { conflict, loadRedemption, redemptionIntent, type IntentDeps } from "./intent-context.ts";
import { requireIssuerAccount } from "./issuer-access.ts";

type IssuerStep = "accept" | "reject" | "fulfil";

/** The issuer's accept, reject or fulfil, under the contract's status, deadline and settling rules. */
export async function issuerRedemptionIntent(
  deps: IntentDeps,
  id: string,
  step: IssuerStep,
  body: { reason?: string; evidenceHash?: string },
): Promise<RedemptionIntent> {
  const r = await loadRedemption(deps, id);
  await requireIssuerAccount(deps.db, deps.chain, deps.caller, r.representation_id, deps.subject);
  const nowMs = deps.now.getTime();
  if (r.settling) throw conflict("A token call for this redemption is still in flight");
  if (step === "accept") {
    if (r.status !== "requested") throw conflict(`A ${r.status} redemption cannot be accepted`);
    if (nowMs > r.accept_deadline_ms)
      throw conflict("The accept deadline has passed; it can only expire");
    return redemptionIntent(r, step, acceptRedemptionAction(deps.coreId, id));
  }
  if (step === "reject") {
    if (r.status !== "requested" && r.status !== "accepted")
      throw conflict(`A ${r.status} redemption cannot be rejected`);
    const deadline = r.status === "requested" ? r.accept_deadline_ms : r.fulfil_deadline_ms;
    if (deadline !== null && nowMs > deadline)
      throw conflict("The deadline has passed; the redemption can only expire");
    return redemptionIntent(r, step, rejectRedemptionAction(deps.coreId, id, body.reason ?? ""));
  }
  if (r.status !== "accepted") throw conflict(`A ${r.status} redemption cannot be fulfilled`);
  if (r.fulfil_deadline_ms !== null && nowMs > r.fulfil_deadline_ms)
    throw conflict("The fulfil deadline has passed; the redemption can only expire");
  return redemptionIntent(
    r,
    step,
    fulfilRedemptionAction(deps.coreId, id, body.evidenceHash ?? ""),
  );
}
