import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
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

const list = async (query = "") => {
  const res = await app.inject({ method: "GET", url: `/v1/assets${query}` });
  expect(res.statusCode, res.body).toBe(200);
  return ENDPOINTS.listAssets.response.parse(res.json());
};

describe("GET /v1/assets", () => {
  it("serves the MVP order by default, with market figures and filter facts", async () => {
    const page = await list();
    expect(page.items.map((i) => i.id)).toEqual(["tgold-a", "tgold-b"]);
    expect(page.total).toBe(2);
    expect(page.nextCursor).toBeNull();
    const a = page.items[0]!;
    expect([a.convertible, a.bridgeable, a.chains, a.tags]).toEqual([
      true,
      true,
      ["near-testnet", "base-sepolia"],
      ["gold", "synthetic"],
    ]);
    // Without a profile an asset is on NEAR only and not bridgeable.
    expect([page.items[1]!.chains, page.items[1]!.bridgeable]).toEqual([["near-testnet"], false]);
  });

  it("uses real figures where they exist and labels every figure with its class", async () => {
    const all = await list();
    const [a, b] = all.items;
    expect([a?.market?.price, a?.market?.simulated, a?.market?.sources]).toEqual([
      "99",
      false,
      ["pontis_trades"],
    ]);
    expect([b?.market?.price, b?.market?.simulated, b?.market?.sources]).toEqual([
      "2",
      true,
      ["simulated_feed"],
    ]);
    const simulated = await list("?data=simulated");
    expect(simulated.items.map((i) => [i.market?.price, i.market?.simulated])).toEqual([
      ["110", true],
      ["2", true],
    ]);
    // Real data only: tgold-b has none, and that is null, not a simulated stand-in.
    expect((await list("?data=real")).items.map((i) => i.market?.price ?? null)).toEqual([
      "99",
      null,
    ]);
  });

  it("computes change, market cap, volume and rank from simulated data and leaves unknowns null", async () => {
    const [a] = (await list("?data=simulated")).items;
    expect(a?.market).toMatchObject({
      change24hBps: 1000,
      change7dBps: null,
      // 1500 tokens at 6 decimals of supply summed over two chains, times 110.
      supply: "1500000000",
      marketCap: "165000",
      volume24h: "550",
    });
    const real = (await list("?data=real")).items[0]?.market;
    expect([real?.supply, real?.marketCap]).toEqual([null, null]);
  });

  it("sorts with nulls last in both directions and breaks ties by ID", async () => {
    const desc = await list("?data=simulated&sort=marketCap&order=desc");
    const asc = await list("?data=simulated&sort=marketCap&order=asc");
    expect(desc.items.map((i) => i.id)).toEqual(["tgold-a", "tgold-b"]);
    expect(asc.items.map((i) => i.id)).toEqual(["tgold-b", "tgold-a"]);
    // On real data only tgold-a has a price, so it leads whichever way the order points.
    for (const order of ["asc", "desc"]) {
      expect((await list(`?data=real&sort=price&order=${order}`)).items.map((i) => i.id)).toEqual([
        "tgold-a",
        "tgold-b",
      ]);
    }
  });

  it("filters by category, issuer, status, verification, chain, convertible and bridgeable", async () => {
    const ids = async (query: string) => (await list(query)).items.map((i) => i.id);
    expect(await ids("?issuerId=synthetic-issuer-b")).toEqual(["tgold-b"]);
    expect(await ids("?bridgeable=true")).toEqual(["tgold-a"]);
    expect(await ids("?bridgeable=false")).toEqual(["tgold-b"]);
    expect(await ids("?chain=base-sepolia")).toEqual(["tgold-a"]);
    expect(await ids("?convertible=true")).toEqual(["tgold-a", "tgold-b"]);
    expect(await ids("?verification=independently_verified")).toEqual([]);
    expect(await ids("?status=active")).toEqual(["tgold-a", "tgold-b"]);
    expect(await ids("?category=Nothing")).toEqual([]);
  });

  it("searches by symbol, claim, issuer and tag, all words required", async () => {
    const ids = async (q: string) =>
      (await list(`?q=${encodeURIComponent(q)}`)).items.map((i) => i.id);
    expect(await ids("tgold-b")).toEqual(["tgold-b"]);
    expect(await ids("gold synthetic")).toEqual(["tgold-a", "tgold-b"]);
    expect(await ids("issuer b")).toEqual(["tgold-b"]);
    expect(await ids("synthetic nonsense")).toEqual([]);
    // LIKE wildcards in the query are text.
    expect(await ids("100%")).toEqual([]);
  });

  it("pages with an opaque cursor that only works for the query it came from", async () => {
    const first = await list("?limit=1&sort=name");
    expect(first.items).toHaveLength(1);
    expect(first.total).toBe(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await list(`?limit=1&sort=name&cursor=${first.nextCursor}`);
    expect([first.items[0]!.id, second.items[0]!.id]).toEqual(["tgold-a", "tgold-b"]);
    expect(second.nextCursor).toBeNull();

    for (const url of [
      `/v1/assets?limit=1&sort=price&cursor=${first.nextCursor}`,
      "/v1/assets?cursor=not-a-cursor",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("VALIDATION_ERROR");
    }
  });

  it("gives a priced asset a seven day sparkline of the class its figures use", async () => {
    const [a, b] = (await list("?data=simulated")).items;
    expect(a?.sparkline).toMatchObject({ interval: "4h", simulated: true });
    expect(a?.sparkline?.points.length).toBeGreaterThan(1);
    expect(b?.sparkline?.points.every((p) => p === "2")).toBe(true);
    // Real data has no candles in this fixture beyond one price, so asset A's real sparkline is short.
    expect((await list("?data=real")).items[1]?.sparkline).toBeNull();
  });

  it("rejects a bad query with a validation error", async () => {
    for (const q of ["?limit=0", "?limit=101", "?sort=rank", "?order=up", "?data=fake"]) {
      const res = await app.inject({ method: "GET", url: `/v1/assets${q}` });
      expect(res.statusCode, q).toBe(400);
    }
  });
});
