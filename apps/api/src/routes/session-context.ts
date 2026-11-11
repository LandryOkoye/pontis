// What the session route files share: the caller as the custody services see it, and the request
// path as the audit subject.

import type { FastifyInstance } from "fastify";
import type { AuthContext, authenticateRequest } from "../auth/authorize.ts";
import type { CustodyRepository } from "../custody/chain.ts";

export const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export interface SessionRouteDeps {
  auth: AuthContext;
  chain: CustodyRepository;
  coreId: string;
  now?: (() => Date) | undefined;
}

export type SessionPrincipal = Awaited<ReturnType<typeof authenticateRequest>>;

export const clockOf = (deps: SessionRouteDeps) => () => (deps.now ?? (() => new Date()))();

export type Register = (app: FastifyInstance, deps: SessionRouteDeps) => void;
