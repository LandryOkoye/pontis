// The one gate for admin endpoints and for the session endpoints: who is calling, and may they.
// Every admin call, allowed or refused, leaves an audit row.

import type { Db } from "@pontis/db";
import { LEGACY_ACTOR, auditAdmin, keyFingerprint } from "../admin/audit.ts";
import { bearerToken, isLegacyKey } from "../admin/auth.ts";
import { AppError } from "../errors.ts";
import {
  ADMIN_POLICY,
  SESSION_POLICY,
  type AdminOperation,
  type SessionOperation,
} from "./policy.ts";
import { authenticateSession } from "./session.ts";
import type { AuthDeps, Principal } from "./types.ts";

/** What route handlers need to authenticate a request. */
export interface AuthContext {
  db: Db;
  auth: AuthDeps;
  /** The break-glass key; unset closes that path. */
  adminApiKey?: string | undefined;
}

type RequestLike = { url: string; headers: { authorization?: string | undefined } };
const pathOf = (req: RequestLike) => req.url.split("?")[0] ?? "";

/**
 * Authenticates `req` for an admin operation and checks the policy table. Returns the caller;
 * throws `UNAUTHORIZED` (no or invalid credential) or `FORBIDDEN` (a session whose account holds
 * none of the operation's roles). The legacy key passes every policy: it is break-glass.
 */
export async function authorizeAdmin(
  ctx: AuthContext,
  req: RequestLike,
  operation: AdminOperation,
): Promise<Principal> {
  const subject = pathOf(req);
  const policy = ADMIN_POLICY[operation];
  const token = bearerToken(req.headers.authorization);
  const refuse = async (): Promise<never> => {
    await auditAdmin(ctx.db, { actor: "anonymous", action: "admin.auth_failed", subject });
    throw new AppError("UNAUTHORIZED", 401, "A valid session or admin key is required");
  };
  if (token === undefined) return refuse();

  if (isLegacyKey(ctx.adminApiKey, token)) {
    await auditAdmin(ctx.db, {
      actor: LEGACY_ACTOR,
      action: policy.action,
      subject,
      detail: { keyFingerprint: keyFingerprint(token) },
    });
    return { kind: "legacy-key" };
  }

  let principal: Extract<Principal, { kind: "session" }>;
  try {
    principal = await authenticateSession(ctx.db, ctx.auth, token, policy.sensitive);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") return refuse();
    throw error;
  }
  const entry = { actor: principal.accountId, actorKey: principal.publicKey, subject };
  if (!principal.roles.some((role) => policy.roles.includes(role))) {
    await auditAdmin(ctx.db, {
      ...entry,
      action: "admin.forbidden",
      detail: { operation, roles: principal.roles },
    });
    throw new AppError(
      "FORBIDDEN",
      403,
      `This account holds none of the roles that may call this: ${policy.roles.join(", ")}`,
    );
  }
  await auditAdmin(ctx.db, { ...entry, action: policy.action });
  return principal;
}

/** Authenticates a session-only endpoint (`/v1/auth/me`, `/v1/auth/logout`): no legacy key. */
export async function requireSession(
  ctx: AuthContext,
  req: RequestLike,
): Promise<{ principal: Extract<Principal, { kind: "session" }>; token: string }> {
  const token = bearerToken(req.headers.authorization);
  if (token === undefined) throw new AppError("UNAUTHORIZED", 401, "A session token is required");
  return { principal: await authenticateSession(ctx.db, ctx.auth, token, false), token };
}

type SessionPrincipal = Extract<Principal, { kind: "session" }>;

/**
 * Authenticates a session endpoint (ADR 0020 section 10): any live wallet session, never the
 * break-glass key, because these calls act as an account. A missing or invalid token is audited as
 * a failed authentication and answered 401. Whether the account may touch the record is decided
 * by the caller once it has read the record: see `custody/issuer-access.ts`.
 */
export async function authenticateRequest(
  ctx: AuthContext,
  req: RequestLike,
): Promise<SessionPrincipal> {
  const token = bearerToken(req.headers.authorization);
  const refuse = async (): Promise<never> => {
    await auditAdmin(ctx.db, {
      actor: "anonymous",
      action: "admin.auth_failed",
      subject: pathOf(req),
    });
    throw new AppError("UNAUTHORIZED", 401, "A valid wallet session is required");
  };
  if (token === undefined) return refuse();
  try {
    return await authenticateSession(ctx.db, ctx.auth, token, false);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") return refuse();
    throw error;
  }
}

/** Records an allowed session call. `detail` must never hold a payout instruction. */
export async function auditSessionCall(
  ctx: AuthContext,
  principal: SessionPrincipal,
  operation: SessionOperation,
  req: RequestLike,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await auditAdmin(ctx.db, {
    actor: principal.accountId,
    actorKey: principal.publicKey,
    action: SESSION_POLICY[operation].action,
    subject: pathOf(req),
    detail,
  });
}
