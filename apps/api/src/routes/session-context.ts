// What the session route files share: the caller as the custody services see it, and the request
// path as the audit subject.

import type { FastifyInstance } from "fastify";
import type { AuthContext, authenticateRequest } from "../auth/authorize.ts";
import type { CustodyRepository } from "../custody/chain.ts";
import type { Caller, IntentDeps } from "../custody/intent-context.ts";

export const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export interface SessionRouteDeps {
  auth: AuthContext;
  chain: CustodyRepository;
  coreId: string;
  now?: (() => Date) | undefined;
}

export type SessionPrincipal = Awaited<ReturnType<typeof authenticateRequest>>;

export const pathOf = (req: { url: string }) => req.url.split("?")[0] ?? "";

export const callerOf = (who: SessionPrincipal): Caller => ({
  accountId: who.accountId,
  publicKey: who.publicKey,
  roles: who.roles,
});

export const clockOf = (deps: SessionRouteDeps) => () => (deps.now ?? (() => new Date()))();

export function intentDepsOf(
  deps: SessionRouteDeps,
  who: SessionPrincipal,
  req: { url: string },
): IntentDeps {
  return {
    db: deps.auth.db,
    chain: deps.chain,
    coreId: deps.coreId,
    caller: callerOf(who),
    subject: pathOf(req),
    now: clockOf(deps)(),
  };
}

export type Register = (app: FastifyInstance, deps: SessionRouteDeps) => void;
