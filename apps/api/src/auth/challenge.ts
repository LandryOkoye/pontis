// Step 1 of sign-in: a single-use challenge the wallet signs with NEP-413 `signMessage`.

import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { ENDPOINTS } from "@pontis/api-types";
import { authChallenges, authSessions, type Db } from "@pontis/db";
import { lt, or } from "drizzle-orm";
import { NONCE_TTL_MS, type AuthDeps } from "./types.ts";

type ChallengeResponse = z.infer<typeof ENDPOINTS.authChallenge.response>;

/** How long spent rows stay before the next challenge removes them. */
const KEEP_MS = 60 * 60_000;

/** The exact text shown to the wallet user. It names the account, the network and what it grants. */
export function challengeMessage(deps: AuthDeps, accountId: string, expiresAt: Date): string {
  return (
    `Sign in to the Pontis API as ${accountId}. ` +
    `Network: ${deps.networkId}; synthetic test assets only. ` +
    `This signs a session, never a transaction, and moves no funds. ` +
    `Valid until ${expiresAt.toISOString()}.`
  );
}

export async function issueChallenge(
  db: Db,
  deps: AuthDeps,
  accountId: string,
): Promise<ChallengeResponse> {
  const now = (deps.now ?? (() => new Date()))();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);
  const nonce = randomBytes(32).toString("base64");
  const message = challengeMessage(deps, accountId, expiresAt);
  // Sweep before insert: challenges and sessions are cheap rows, and a sweep needs no scheduler.
  const cutoff = new Date(now.getTime() - KEEP_MS);
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, cutoff));
  await db
    .delete(authSessions)
    .where(or(lt(authSessions.maxExpiresAt, cutoff), lt(authSessions.revokedAt, cutoff)));
  await db.insert(authChallenges).values({
    nonce,
    accountId,
    message,
    recipient: deps.recipient,
    createdAt: now,
    expiresAt,
  });
  return {
    accountId,
    nonce,
    recipient: deps.recipient,
    message,
    expiresAt: expiresAt.toISOString(),
  };
}
