// Given the same route, amount, fee and inventory, route comparison and quote creation must agree
// on whether the vault can pay out, including one unit either side of the net payout.

import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteView } from "@pontis/near-client";
import { computeAmounts, keyFromSeed } from "@pontis/quote-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compareRoutes } from "../src/quotes/compare.ts";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { createQuote } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { AppError } from "../src/errors.ts";
import { unguarded } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const key = keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const pair = { fromId: "tgold-a", toId: "tgold-b" };

function chainWith(num: string, den: string, feeBps: number, inventory: bigint): QuoteChain {
  const route: ChainRouteView = {
    executable: true,
    refusal: null,
    terms: { ratio: { num, den }, compatibility_version: 2, policy_version: 1 },
  };
  return unguarded({
    getRoute: async () => route,
    isAllowed: async () => true,
    getInventory: async () => inventory.toString(),
    getFeeBps: async () => feeBps,
  });
}

async function compareSays(chain: QuoteChain, amount: string): Promise<boolean> {
  const res = await compareRoutes(t.db, chain, { ...pair, amount });
  return res.routes[0]?.executable === true;
}

async function quoteSays(chain: QuoteChain, amountIn: string): Promise<boolean> {
  const request = { ...pair, amountIn, accountId: "alice.testnet" };
  const deps = { db: t.db, chain, key, coreId: "core.testnet" };
  try {
    await createQuote(deps, request);
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("INSUFFICIENT_INVENTORY");
    return false;
  }
}

// ratio num, ratio den, fee bps, amount in
const cases: [string, string, number, string][] = [
  ["1000", "1", 10, "1"], // the reviewed example: gross 1,000, fee 1, net 999
  ["1000", "1", 10, "1000000"],
  ["1001", "1", 10, "1"], // fee of 1.001 rounds up to 2
  ["1000", "1", 0, "1"], // no fee: net equals gross
  ["3", "2", 100, "7"], // gross floors from 10.5 to 10; a 1% fee rounds up to 1
  ["1", "1000", 100, "123456"],
];

describe("route comparison and quote creation agree on inventory", () => {
  it.each(cases)("ratio %s/%s, fee %i bps, amount %s", async (num, den, feeBps, amountIn) => {
    const amounts = computeAmounts(
      BigInt(amountIn),
      { num: BigInt(num), den: BigInt(den) },
      feeBps,
    );
    if (!amounts) throw new Error("test case overflows u128");
    const { net } = amounts;
    for (const inventory of [net - 1n, net, net + 1n]) {
      const chain = chainWith(num, den, feeBps, inventory);
      const expected = inventory >= net;
      expect(await compareSays(chain, amountIn), `compare with inventory ${inventory}`).toBe(
        expected,
      );
      expect(await quoteSays(chain, amountIn), `quote with inventory ${inventory}`).toBe(expected);
    }
  });
});
