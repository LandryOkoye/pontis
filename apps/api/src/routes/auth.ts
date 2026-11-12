// Wallet sign-in (ADR 0019). Four endpoints; none touches a chain transaction.

import { ENDPOINTS } from "@pontis/api-types";
import type { FastifyInstance } from "fastify";
import { auditAdmin } from "../admin/audit.ts";
import { requireSession, type AuthContext } from "../auth/authorize.ts";
import { issueChallenge } from "../auth/challenge.ts";
import { revokeSession } from "../auth/session.ts";
import { SignInRefused, verifySignIn } from "../auth/verify.ts";

export function registerAuthRoutes(app: FastifyInstance, ctx: AuthContext): void {
  const e = ENDPOINTS;

  app.post(e.authChallenge.path, async (req) => {
    const { accountId } = e.authChallenge.body.parse(req.body);
    return e.authChallenge.response.parse(await issueChallenge(ctx.db, ctx.auth, accountId));
  });

  app.post(e.authVerify.path, async (req) => {
    const body = e.authVerify.body.parse(req.body);
    let session;
    try {
      session = await verifySignIn(ctx.db, ctx.auth, body);
    } catch (error) {
      if (error instanceof SignInRefused)
        await auditAdmin(ctx.db, {
          actor: "anonymous",
          action: "auth.sign_in_failed",
          subject: e.authVerify.path,
          detail: { accountId: body.accountId, reason: error.reason },
        });
      throw error;
    }
    await auditAdmin(ctx.db, {
      actor: session.accountId,
      actorKey: body.publicKey,
      action: "auth.sign_in",
      subject: e.authVerify.path,
      detail: { keyType: session.keyType, roles: session.roles },
    });
    return e.authVerify.response.parse({
      token: session.token,
      tokenType: "Bearer",
      accountId: session.accountId,
      roles: session.roles,
      keyType: session.keyType,
      expiresAt: session.expiresAt.toISOString(),
      maxExpiresAt: session.maxExpiresAt.toISOString(),
    });
  });

  app.post(e.authLogout.path, async (req) => {
    const { principal, token } = await requireSession(ctx, req);
    await revokeSession(ctx.db, ctx.auth, token);
    await auditAdmin(ctx.db, {
      actor: principal.accountId,
      actorKey: principal.publicKey,
      action: "auth.logout",
      subject: e.authLogout.path,
    });
    return e.authLogout.response.parse({ revoked: true });
  });

  app.get(e.authMe.path, async (req) => {
    const { principal } = await requireSession(ctx, req);
    return e.authMe.response.parse({
      accountId: principal.accountId,
      roles: principal.roles,
      expiresAt: principal.expiresAt.toISOString(),
    });
  });
}
