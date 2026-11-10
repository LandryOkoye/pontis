// The conversion spans several NEAR receipts and relies on a compensating refund, so no API text may
// call it atomic (a negation such as "not an atomic transaction" is the honest wording).

import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteView } from "@pontis/near-client";
import { keyFromSeed } from "@pontis/quote-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compareRoutes } from "../src/quotes/compare.ts";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { createQuote } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "@pontis/db/testing";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const route: ChainRouteView = {
  executable: true,
  refusal: null,
  terms: { ratio: { num: "1000", den: "1" }, compatibility_version: 2, policy_version: 1 },
};
const chain: QuoteChain = {
  getRoute: async () => route,
  isAllowed: async () => true,
  getInventory: async () => "1000000000000",
  getFeeBps: async () => 10,
};
const claimsAtomicity = (text: string) => /(?<!\bnot (an? )?)\batomic(ally)?\b/i.test(text);
const pair = { fromId: "tgold-a", toId: "tgold-b" };

describe("settlement wording", () => {
  it("describes the quoted route as asynchronous settlement with a refund, not as atomic", async () => {
    const quote = await createQuote(
      { db: t.db, chain, key: keyFromSeed(new Uint8Array(32).fill(7)), coreId: "core.testnet" },
      { ...pair, amountIn: "1000000", accountId: "alice.testnet" },
    );
    expect(quote.route.settlement).toBe("ASYNC_CALLBACK_WITH_REFUND");
    expect(quote.route.description).toContain("refund");
    expect(claimsAtomicity(quote.route.description)).toBe(false);
  });

  it("does not call the compared route atomic", async () => {
    const { routes } = await compareRoutes(t.db, chain, pair);
    expect(routes[0]?.explanation).toContain("not atomic");
    expect(claimsAtomicity(routes[0]?.explanation ?? "")).toBe(false);
  });
});
