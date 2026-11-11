// Shared set-up for the session endpoint tests: a signed-in redeemer, an issuer back-office
// account, an operator and a stranger, over a fixture chain whose issuer controls one account.

import { auditLog, type Db } from "@pontis/db";
import { issuers, fixtureRedemption, fixtureRedemptionTerms } from "@pontis/near-client/fixtures";
import type { ChainIssuer, ChainRedemption } from "@pontis/near-client";
import type { CustodyRepository } from "../src/custody/chain.ts";
import { harness, walletKey, type Harness } from "./auth-helpers.ts";
import { fixtureRepo, pagedOver } from "./custody-helpers.ts";
import { fakeAuthChain } from "./helpers.ts";

export const people = {
  alice: { id: "alice.testnet", key: walletKey(21) },
  bo: { id: "issuer-bo.testnet", key: walletKey(22) },
  owen: { id: "owen.testnet", key: walletKey(23) },
  eve: { id: "eve.testnet", key: walletKey(24) },
  /** Controls issuer B only. */
  bob: { id: "issuer-b-bo.testnet", key: walletKey(25) },
};

/** The clock of the tests: an hour after the fixture redemption was requested. */
export const NOW = new Date(fixtureRedemption.created_ms + 3_600_000);

/** Issuer A controls `bo`, issuer B controls `bob`; the fixture's own issuers control nobody. */
export const controlledIssuers: ChainIssuer[] = issuers.map((i) => ({
  ...i,
  controlled_accounts: i.id === "synthetic-issuer-a" ? [people.bo.id] : [people.bob.id],
}));

export const redemption = (over: Partial<ChainRedemption> = {}): ChainRedemption => ({
  ...fixtureRedemption,
  ...over,
});

export const terms = (over: Partial<typeof fixtureRedemptionTerms.terms> = {}) => ({
  ...fixtureRedemptionTerms,
  terms: { ...fixtureRedemptionTerms.terms, ...over },
});

export function repo(over: Partial<CustodyRepository> = {}): CustodyRepository {
  return fixtureRepo({
    getIssuer: async (id) => controlledIssuers.find((i) => i.id === id) ?? null,
    ...over,
  });
}

/** Everything the app needs; `over` replaces chain views. Sign-in keys exist for every person. */
export function sessionHarness(db: Db, over: Partial<CustodyRepository> = {}): Harness {
  const keys = Object.fromEntries(
    Object.values(people).map((p) => [p.id, { [p.key.publicKey]: "full_access" as const }]),
  );
  return harness(db, fakeAuthChain(keys, { [people.owen.id]: ["registrar"] }), {
    custodyChain: repo(over),
    now: () => NOW,
    adminApiKey: "0123456789abcdef-legacy-key",
  });
}

export async function tokenFor(h: Harness, who: keyof typeof people): Promise<string> {
  return (await h.signIn(people[who].id, people[who].key)).token;
}

export const call = (
  h: Harness,
  method: "GET" | "POST",
  url: string,
  token?: string,
  payload?: unknown,
) =>
  h.app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

export const auditRows = async (db: Db) =>
  (await db.select().from(auditLog)).filter((r) => !r.action.startsWith("auth."));

export { pagedOver };
