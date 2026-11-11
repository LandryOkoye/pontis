// A redeemer's endpoints (ADR 0020 section 10): prepare a redemption request and reclaim an
// escrow. Both authenticate a wallet session and return unsigned actions; the API signs and
// sends nothing. Every allowed call leaves an audit row that never holds a payout instruction.

import { ENDPOINTS } from "@pontis/api-types";
import { auditSessionCall, authenticateRequest } from "../auth/authorize.ts";
import { prepareRedemption } from "../custody/prepare.ts";
import { reclaimIntent } from "../custody/reclaim.ts";
import { clockOf, intentDepsOf, route, type Register } from "./session-context.ts";

export const registerRedemptionRoutes: Register = (app, deps) => {
  const e = ENDPOINTS;
  const { auth, chain, coreId } = deps;

  app.post(route(e.prepareRedemption.path), async (req, reply) => {
    const who = await authenticateRequest(auth, req);
    const body = e.prepareRedemption.body.parse(req.body);
    const { response, payoutInstructionHash } = await prepareRedemption(
      { db: auth.db, chain, coreId, now: clockOf(deps) },
      who.accountId,
      body,
    );
    // The instruction itself is never audited or logged: only what the chain will see.
    await auditSessionCall(auth, who, "prepareRedemption", req, {
      prepareId: response.prepareId,
      representationId: body.representationId,
      amount: body.amount,
      payoutInstructionHash,
    });
    void reply.code(e.prepareRedemption.status);
    return e.prepareRedemption.response.parse(response);
  });

  app.post(route(e.reclaimRedemptionIntent.path), async (req) => {
    const who = await authenticateRequest(auth, req);
    const { id } = e.reclaimRedemptionIntent.params.parse(req.params);
    const result = await reclaimIntent(intentDepsOf(deps, who, req), id);
    await auditSessionCall(auth, who, "reclaimRedemptionIntent", req, { redemptionId: id });
    return e.reclaimRedemptionIntent.response.parse(result);
  });
};
