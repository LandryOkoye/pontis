// Sessions: opaque random tokens, stored as a hash, renewed by use, revocable at once.

import { createHash, randomBytes } from "node:crypto";
import { ROLE_NAMES, type RoleName } from "@pontis/api-types";
import { authSessions, type Db } from "@pontis/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AppError } from "../errors.ts";
import {
  ROLES_CACHE_MS,
  SESSION_MAX_MS,
  SESSION_TTL_MS,
  type AuthDeps,
  type KeyType,
  type Principal,
} from "./types.ts";

const clock = (deps: AuthDeps) => (deps.now ?? (() => new Date()))();
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The roles this API knows, deduplicated, in the contract's order. Unknown names are dropped. */
export function knownRoles(raw: readonly string[]): RoleName[] {
  return ROLE_NAMES.filter((name) => raw.includes(name));
}

export interface NewSession {
  token: string;
  roles: RoleName[];
  expiresAt: Date;
  maxExpiresAt: Date;
}

export async function createSession(
  db: Db,
  deps: AuthDeps,
  who: { accountId: string; publicKey: string; keyType: KeyType; roles: RoleName[] },
): Promise<NewSession> {
  const now = clock(deps);
  const token = randomBytes(32).toString("base64url");
  const maxExpiresAt = new Date(now.getTime() + SESSION_MAX_MS);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(authSessions).values({
    tokenHash: hashToken(token),
    accountId: who.accountId,
    publicKey: who.publicKey,
    keyType: who.keyType,
    roles: who.roles,
    rolesReadAt: now,
    createdAt: now,
    expiresAt,
    maxExpiresAt,
  });
  return { token, roles: who.roles, expiresAt, maxExpiresAt };
}

/**
 * The live session behind `token`, renewed. Roles come from the cache unless they are older than
 * 60 seconds or `freshRoles` is set (sensitive actions): then they are re-read from the chain
 * first, and a chain failure fails the request rather than trusting a stale answer.
 * Throws `UNAUTHORIZED` for an unknown, revoked or expired token.
 */
export async function authenticateSession(
  db: Db,
  deps: AuthDeps,
  token: string,
  freshRoles: boolean,
): Promise<Extract<Principal, { kind: "session" }>> {
  const now = clock(deps);
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.tokenHash, tokenHash),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        gt(authSessions.maxExpiresAt, now),
      ),
    );
  if (!row) throw new AppError("UNAUTHORIZED", 401, "The session is unknown, expired or ended");

  let { roles, rolesReadAt } = row;
  if (freshRoles || now.getTime() - rolesReadAt.getTime() >= ROLES_CACHE_MS) {
    roles = knownRoles(await deps.chain.getAccountRoles(row.accountId));
    rolesReadAt = now;
  }
  const expiresAt = new Date(Math.min(now.getTime() + SESSION_TTL_MS, row.maxExpiresAt.getTime()));
  await db
    .update(authSessions)
    .set({ roles, rolesReadAt, expiresAt })
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
  return {
    kind: "session",
    accountId: row.accountId,
    publicKey: row.publicKey,
    roles: knownRoles(roles),
    expiresAt,
  };
}

/** Ends the session; true if one was live. */
export async function revokeSession(db: Db, deps: AuthDeps, token: string): Promise<boolean> {
  const revoked = await db
    .update(authSessions)
    .set({ revokedAt: clock(deps) })
    .where(and(eq(authSessions.tokenHash, hashToken(token)), isNull(authSessions.revokedAt)))
    .returning({ tokenHash: authSessions.tokenHash });
  return revoked.length > 0;
}
