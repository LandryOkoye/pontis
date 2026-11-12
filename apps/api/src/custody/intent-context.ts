// What every unsigned-action builder of ADR 0020 section 10 needs: the chain, the caller, the clock.

import type { RedemptionIntent, RoleName } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FunctionCallAction } from "@pontis/near-client";
import { AppError, notFound } from "../errors.ts";
import type { CustodyRepository } from "./chain.ts";
import { CUSTODY_NOTICE, ISSUER_SOURCE } from "./labels.ts";

export const intentLabels = { simulated: true, sources: [ISSUER_SOURCE], notice: CUSTODY_NOTICE };

/** The signed-in account behind a session endpoint call. */
export interface Caller {
  accountId: string;
  publicKey: string;
  roles: readonly RoleName[];
}

export interface IntentDeps {
  db: Db;
  chain: CustodyRepository;
  coreId: string;
  caller: Caller;
  subject: string;
  now: Date;
}

export const conflict = (message: string) => new AppError("STATE_CONFLICT", 409, message);

export async function loadRedemption(deps: IntentDeps, id: string) {
  const r = await deps.chain.getRedemption(Number(id));
  if (!r) throw notFound(`Redemption ${id}`);
  return r;
}

export const redemptionIntent = (
  r: { id: number; status: RedemptionIntent["status"] },
  kind: RedemptionIntent["intent"],
  action: FunctionCallAction,
): RedemptionIntent => ({
  redemptionId: String(r.id),
  intent: kind,
  status: r.status,
  actions: [action],
  ...intentLabels,
});
