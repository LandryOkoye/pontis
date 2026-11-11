// Step 2 of sign-in: rebuild the NEP-413 payload, check the signature, check over RPC that the key
// belongs to the account, consume the nonce once, open a session. Every refusal is a 401 that says
// what to do next and, for the audit log, why (`SignInRefused.reason`).

import type { z } from "zod";
import type { ENDPOINTS } from "@pontis/api-types";
import { authChallenges, type Db } from "@pontis/db";
import { verifyNep413 } from "@pontis/quote-engine";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AppError } from "../errors.ts";
import { createSession, knownRoles, type NewSession } from "./session.ts";
import type { AuthDeps, KeyType } from "./types.ts";

type VerifyRequest = z.infer<typeof ENDPOINTS.authVerify.body>;

export type SignInRefusal = "challenge" | "signature" | "key";

export class SignInRefused extends AppError {
  constructor(
    readonly reason: SignInRefusal,
    message: string,
  ) {
    super("UNAUTHORIZED", 401, message);
    this.name = "SignInRefused";
  }
}

export interface SignedIn extends NewSession {
  accountId: string;
  keyType: KeyType;
}

export async function verifySignIn(db: Db, deps: AuthDeps, req: VerifyRequest): Promise<SignedIn> {
  const now = (deps.now ?? (() => new Date()))();
  const [challenge] = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.nonce, req.nonce));
  if (
    !challenge ||
    challenge.accountId !== req.accountId ||
    challenge.consumedAt !== null ||
    challenge.expiresAt.getTime() <= now.getTime()
  )
    throw new SignInRefused(
      "challenge",
      "The challenge is unknown, expired or already used; request a new one",
    );

  const signed = verifyNep413(
    {
      message: challenge.message,
      nonce: Buffer.from(req.nonce, "base64"),
      recipient: challenge.recipient,
      callbackUrl: req.callbackUrl,
    },
    req.publicKey,
    req.signature,
  );
  if (!signed)
    throw new SignInRefused(
      "signature",
      "The signature does not match the challenge, the key or the callback URL",
    );

  // Over RPC, before the nonce is spent: an RPC outage (a 500 here) must not burn a challenge.
  const key = await deps.chain.getAccessKey(req.accountId, req.publicKey);
  if (!key) throw new SignInRefused("key", `The key is not an access key of ${req.accountId}`);
  const roles = knownRoles(await deps.chain.getAccountRoles(req.accountId));

  // The one atomic step: of two concurrent verifies of one challenge, exactly one gets the row.
  const spent = await db
    .update(authChallenges)
    .set({ consumedAt: now })
    .where(
      and(
        eq(authChallenges.nonce, req.nonce),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, now),
      ),
    )
    .returning({ nonce: authChallenges.nonce });
  if (spent.length === 0)
    throw new SignInRefused(
      "challenge",
      "The challenge is unknown, expired or already used; request a new one",
    );

  const session = await createSession(db, deps, {
    accountId: req.accountId,
    publicKey: req.publicKey,
    keyType: key.type,
    roles,
  });
  return { ...session, accountId: req.accountId, keyType: key.type };
}
