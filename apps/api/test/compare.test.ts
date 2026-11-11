import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteView } from "@pontis/near-client";
import { errorCodeOf, unguarded } from "./helpers.ts";
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
const chainWith = (route: ChainRouteView, inventory = "1000000000000", feeBps = 10): QuoteChain =>
  unguarded({
    getRoute: async () => route,
    isAllowed: async () => true,
    getInventory: async () => inventory,
    getFeeBps: async () => feeBps,
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

  // 1 unit at ratio 1000 is 1,000 gross; a 10 bps fee is 1 (rounded up), so the vault must pay 999.
  it("checks inventory against the net payout after the fee, not the gross output", async () => {
    const executable: ChainRouteView = { executable: true, refusal: null, terms };
    const verdict = async (inventory: string) =>
      (await compareRoutes(t.db, chainWith(executable, inventory), { ...pair, amount: "1" }))
        .routes[0];
    expect(await verdict("999")).toMatchObject({ executable: true });
    expect(await verdict("1000")).toMatchObject({ executable: true });
    expect(await verdict("998")).toMatchObject({
      executable: false,
      reasonCode: "INSUFFICIENT_INVENTORY",
    });
  });

  it("rounds the fee up exactly as the contract does", async () => {
    // gross 1,001 at 10 bps is 1.001, rounded up to 2: net 999. A floored fee would ask for 1,000.
    const odd: ChainRouteView = {
      executable: true,
      refusal: null,
      terms: { ...terms, ratio: { num: "1001", den: "1" } },
    };
    const verdict = async (inventory: string) =>
      (await compareRoutes(t.db, chainWith(odd, inventory), { ...pair, amount: "1" })).routes[0]
        ?.executable;
    expect(await verdict("999")).toBe(true);
    expect(await verdict("998")).toBe(false);
  });

  it("needs the whole gross output when the fee is zero", async () => {
    const executable: ChainRouteView = { executable: true, refusal: null, terms };
    const free = (inventory: string): QuoteChain => chainWith(executable, inventory, 0);
    const verdict = async (inventory: string) =>
      (await compareRoutes(t.db, free(inventory), { ...pair, amount: "1" })).routes[0]?.executable;
    expect(await verdict("1000")).toBe(true);
    expect(await verdict("999")).toBe(false);
  });

  it("refuses an amount whose output rounds to nothing, like quote creation does", async () => {
    const down: ChainRouteView = {
      executable: true,
      refusal: null,
      terms: { ...terms, ratio: { num: "1", den: "1000" } },
    };
    expect(
      await errorCodeOf(compareRoutes(t.db, chainWith(down), { ...pair, amount: "999" })),
    ).toBe("VALIDATION_ERROR");
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
