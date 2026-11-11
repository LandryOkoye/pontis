// The issuer back-office (ADR 0020 section 10): the redemption queue and the unsigned accept,
// reject and fulfil. Every handler
// authenticates a wallet session; whether the account may touch the record is decided from the
// chain's `controlled_accounts` (see `custody/issuer-access.ts`). Nothing is signed or sent here.

import { ENDPOINTS } from "@pontis/api-types";
import { auditSessionCall, authenticateRequest } from "../auth/authorize.ts";
import { issuerRedemptionIntent } from "../custody/issuer-intents.ts";
import { issuerRedemptionQueue } from "../custody/issuer-queue.ts";
import {
  callerOf,
  clockOf,
  intentDepsOf,
  pathOf,
  route,
  type Register,
} from "./session-context.ts";

export const registerIssuerRoutes: Register = (app, deps) => {
  const e = ENDPOINTS;
  const { auth, chain } = deps;
  const queueDeps = (who: Parameters<typeof callerOf>[0], req: { url: string }) => ({
    db: auth.db,
    chain,
    caller: callerOf(who),
    subject: pathOf(req),
    now: clockOf(deps)(),
  });

  app.get(route(e.listIssuerRedemptions.path), async (req) => {
    const who = await authenticateRequest(auth, req);
    const q = e.listIssuerRedemptions.query.parse(req.query);
    const result = await issuerRedemptionQueue(queueDeps(who, req), q);
    await auditSessionCall(auth, who, "listIssuerRedemptions", req, {
      issuerIds: result.issuerIds,
    });
    return e.listIssuerRedemptions.response.parse(result);
  });

  for (const [operation, step] of [
    ["acceptRedemption", "accept"],
    ["rejectRedemption", "reject"],
    ["fulfilRedemption", "fulfil"],
  ] as const) {
    const endpoint = e[operation];
    app.post(route(endpoint.path), async (req) => {
      const who = await authenticateRequest(auth, req);
      const { id } = endpoint.params.parse(req.params);
      const body =
        operation === "rejectRedemption"
          ? e.rejectRedemption.body.parse(req.body)
          : operation === "fulfilRedemption"
            ? e.fulfilRedemption.body.parse(req.body)
            : {};
      const result = await issuerRedemptionIntent(intentDepsOf(deps, who, req), id, step, body);
      await auditSessionCall(auth, who, operation, req, { redemptionId: id, ...body });
      return endpoint.response.parse(result);
    });
  }
};
