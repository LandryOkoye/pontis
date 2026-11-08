import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteView } from "@pontis/near-client";
import { errorCodeOf } from "./helpers.ts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compareRoutes } from "../src/quotes/compare.ts";
import type { QuoteChain } from "../src/quotes/chain.ts";
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

const terms = { ratio: { num: "1000", den: "1" }, compatibility_version: 2, policy_version: 1 };
const chainWith = (route: ChainRouteView, inventory = "1000000000000"): QuoteChain => ({
  getRoute: async () => route,
  isAllowed: async () => true,
  getInventory: async () => inventory,
  getFeeBps: async () => 10,
});
const pair = { fromId: "tgold-a", toId: "tgold-b" };

describe("compareRoutes", () => {
  it("reports an executable parity route with its ratio and compatibility version", async () => {
    const res = await compareRoutes(
      t.db,
      chainWith({ executable: true, refusal: null, terms }),
      pair,
    );
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0]).toMatchObject({
      type: "PARITY_CONVERSION",
      executable: true,
      ratio: { num: "1000", den: "1" },
      compatibilityVersion: 2,
    });
    expect(res.routes[0]?.reasonCode).toBeUndefined();
  });

  it.each([
    ["relationship_suspended", "RELATIONSHIP_SUSPENDED"],
    ["asset_paused", "ASSET_PAUSED"],
    ["asset_not_active", "ASSET_PAUSED"],
    ["no_relationship", "NOT_DIRECT_EQUIVALENT"],
    ["relationship_not_approved", "NOT_DIRECT_EQUIVALENT"],
    ["not_direct_equivalent", "NOT_DIRECT_EQUIVALENT"],
  ] as const)("explains a %s refusal as %s", async (refusal, code) => {
    const res = await compareRoutes(
      t.db,
      chainWith({ executable: false, refusal, terms: null }),
      pair,
    );
    expect(res.routes[0]).toMatchObject({ executable: false, reasonCode: code });
    expect(res.routes[0]?.explanation.length).toBeGreaterThan(20);
  });

  it("refuses an amount the vault cannot cover, and accepts one it can", async () => {
    const executable: ChainRouteView = { executable: true, refusal: null, terms };
    const low = await compareRoutes(t.db, chainWith(executable, "999"), { ...pair, amount: "1" });
    expect(low.routes[0]).toMatchObject({
      executable: false,
      reasonCode: "INSUFFICIENT_INVENTORY",
    });
    expect(
      (await compareRoutes(t.db, chainWith(executable, "1000"), { ...pair, amount: "1" })).routes[0]
        ?.executable,
    ).toBe(true);
  });

  it("is a NOT_FOUND error for an asset the catalog does not know", async () => {
    expect(
      await errorCodeOf(
        compareRoutes(t.db, chainWith({ executable: false, refusal: null, terms: null }), {
          fromId: "ghost",
          toId: "tgold-b",
        }),
      ),
    ).toBe("NOT_FOUND");
  });
});
