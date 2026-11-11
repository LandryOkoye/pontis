// A fake wallet for the sign-in tests: it holds ed25519 keys and answers `signMessage` the way a
// NEP-413 wallet does, from the challenge the API returned.

import { ENDPOINTS } from "@pontis/api-types";
import { keyFromSeed, signNep413, type QuoteKey } from "@pontis/quote-engine";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { z } from "zod";
import { buildApp } from "../src/app.ts";
import { fakeAuthChain, testAppDeps } from "./helpers.ts";
import type { Db } from "@pontis/db";

export const walletKey = (byte: number): QuoteKey => keyFromSeed(Buffer.alloc(32, byte));

export type Challenge = z.infer<typeof ENDPOINTS.authChallenge.response>;
export type Session = z.infer<typeof ENDPOINTS.authVerify.response>;

export interface Harness {
  app: FastifyInstance;
  chain: ReturnType<typeof fakeAuthChain>;
  /** The API's clock; move it to age challenges and sessions. */
  clock: { now: Date };
  challenge(accountId: string): Promise<Challenge>;
  /** What the wallet sends back: signs `challenge` with `key`, then POSTs verify. */
  verify(
    challenge: Challenge,
    key: QuoteKey,
    over?: { accountId?: string; callbackUrl?: string; signedCallbackUrl?: string },
  ): Promise<{ status: number; body: unknown }>;
  /** Challenge plus verify, expecting success. */
  signIn(accountId: string, key: QuoteKey): Promise<Session>;
  get(url: string, token?: string): Promise<LightMyRequestResponse>;
  post(url: string, token?: string): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

export function harness(
  db: Db,
  chain = fakeAuthChain(),
  extra: Partial<Parameters<typeof testAppDeps>[1]> = {},
): Harness {
  const clock = { now: new Date("2026-11-11T12:00:00.000Z") };
  const base = testAppDeps(db, extra);
  const app = buildApp({
    ...base,
    auth: { ...base.auth, chain: chain.chain, now: () => clock.now },
  });
  const h: Harness = {
    app,
    chain,
    clock,
    async challenge(accountId) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/challenge",
        payload: { accountId },
      });
      if (res.statusCode !== 200) throw new Error(`challenge ${res.statusCode}: ${res.body}`);
      return ENDPOINTS.authChallenge.response.parse(res.json());
    },
    async verify(challenge, key, over = {}) {
      const signedCallback = over.signedCallbackUrl ?? over.callbackUrl;
      const signature = signNep413(key, {
        message: challenge.message,
        nonce: Buffer.from(challenge.nonce, "base64"),
        recipient: challenge.recipient,
        callbackUrl: signedCallback ?? null,
      });
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/verify",
        payload: {
          accountId: over.accountId ?? challenge.accountId,
          publicKey: key.publicKey,
          signature,
          nonce: challenge.nonce,
          ...(over.callbackUrl ? { callbackUrl: over.callbackUrl } : {}),
        },
      });
      return { status: res.statusCode, body: res.json() as unknown };
    },
    async signIn(accountId, key) {
      const reply = await h.verify(await h.challenge(accountId), key);
      if (reply.status !== 200)
        throw new Error(`verify ${reply.status}: ${JSON.stringify(reply.body)}`);
      return ENDPOINTS.authVerify.response.parse(reply.body);
    },
    get: (url, token) =>
      app.inject({
        method: "GET",
        url,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    post: (url, token) =>
      app.inject({
        method: "POST",
        url,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    close: () => app.close(),
  };
  return h;
}
