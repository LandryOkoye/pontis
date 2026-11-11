import { ENDPOINTS } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { formatPrice, parsePrice } from "@pontis/domain";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { NOW, seedMarket } from "./market-helpers.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  await seedMarket(t.db);
  app = buildApp(testAppDeps(t.db, { now: () => NOW }));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const read = async <
  K extends "getMarketOverview" | "getMarketMovers" | "getMarketCategories" | "getMarketChains",
>(
  op: K,
  query = "",
) => {
  const res = await app.inject({ method: "GET", url: `${ENDPOINTS[op].path}${query}` });
  expect(res.statusCode, res.body).toBe(200);
  return ENDPOINTS[op].response.parse(res.json()) as ReturnType<
    (typeof ENDPOINTS)[K]["response"]["parse"]
  >;
};

describe("market overview", () => {
  it("totals are the sums of the directory rows, so a dashboard figure is the table's figure", async () => {
    const overview = await read("getMarketOverview", "?data=simulated");
    const rows = ENDPOINTS.listAssets.response.parse(
      (await app.inject({ method: "GET", url: "/v1/assets?data=simulated" })).json(),
    ).items;
    const total = (pick: (i: (typeof rows)[number]) => string | null | undefined) =>
      formatPrice(rows.reduce((s, i) => s + parsePrice(pick(i) ?? "0"), 0n));
    expect(overview.totalMarketCap).toBe(total((i) => i.market?.marketCap));
    expect(overview.totalTvl).toBe(total((i) => i.market?.tvl));
    expect(overview.volume24h).toBe(total((i) => i.market?.volume24h));
    expect(overview).toMatchObject({
      assetCount: 2,
      pricedAssetCount: 2,
      issuerCount: 2,
      chainCount: 2,
      convertibleAssetCount: 2,
      simulated: true,
      sources: ["simulated_feed"],
      // Market-cap weighted: (165000 x 1000 bps + 18000 x 0) / 183000.
      change24hBps: 901,
      totalMarketCap: "183000",
    });
  });

  it("leaves a total null, not zero, when no asset has the figure, and never blends in simulated data", async () => {
    const real = await read("getMarketOverview", "?data=real");
    expect(real).toMatchObject({
      pricedAssetCount: 1,
      totalMarketCap: null,
      change24hBps: null,
      simulated: false,
      sources: ["pontis_trades"],
    });
  });
});

describe("market movers", () => {
  it("lists gainers and losers by 24h change and honours the limit", async () => {
    const movers = await read("getMarketMovers", "?data=simulated");
    expect(movers.gainers.map((m) => m.id)).toEqual(["tgold-a"]);
    expect(movers.losers).toEqual([]);
    expect(movers.topByVolume.map((m) => m.id)).toEqual(["tgold-a", "tgold-b"]);
    expect(movers.newlyListed.map((m) => m.id).sort()).toEqual(["tgold-a", "tgold-b"]);
    expect((await read("getMarketMovers", "?data=simulated&limit=1")).topByVolume).toHaveLength(1);
  });

  it("keeps assets without a figure out of that list, and without a price out of the ranked ones", async () => {
    const real = await read("getMarketMovers", "?data=real");
    expect(real.topByVolume.map((m) => m.id)).toEqual(["tgold-a"]);
    // Newly listed includes an unpriced asset, with a null market block.
    expect(real.newlyListed.find((m) => m.id === "tgold-b")?.market).toBeNull();
  });
});

describe("categories and chains", () => {
  it("groups by category", async () => {
    const { items } = await read("getMarketCategories", "?data=simulated");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ assetCount: 2, marketCap: "183000", simulated: true });
  });

  it("values supply per chain at each asset's price", async () => {
    const { items } = await read("getMarketChains", "?data=simulated");
    expect(items.map((c) => [c.chain, c.assetCount, c.value])).toEqual([
      ["base-sepolia", 1, "55000"],
      ["near-testnet", 2, "128000"],
    ]);
    expect(items[1]?.supplies).toEqual([
      { id: "tgold-a", supply: "1000000000" },
      { id: "tgold-b", supply: "900000000000" },
    ]);
  });
});
