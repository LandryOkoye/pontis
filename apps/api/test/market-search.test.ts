import { ENDPOINTS } from "@pontis/api-types";
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

const get = (url: string) => app.inject({ method: "GET", url });

describe("GET /v1/search", () => {
  const find = async (q: string) =>
    ENDPOINTS.search.response.parse((await get(`/v1/search?q=${encodeURIComponent(q)}`)).json());

  it("finds assets with an exact symbol first, issuers by name and chains by name", async () => {
    expect((await find("gold")).assets.map((a) => a.id)).toEqual(["tgold-a", "tgold-b"]);
    expect((await find("tgold-b")).assets.map((a) => a.id)).toEqual(["tgold-b"]);
    expect((await find("issuer b")).issuers.map((i) => i.id)).toEqual(["synthetic-issuer-b"]);
    expect((await find("base")).chains).toEqual([{ chain: "base-sepolia", assetCount: 1 }]);
    expect((await find("near")).chains).toEqual([{ chain: "near-testnet", assetCount: 2 }]);
  });

  it("returns empty lists, not an error, for no match, and rejects an empty query", async () => {
    expect(await find("zzzz")).toMatchObject({ assets: [], issuers: [], chains: [] });
    expect((await get("/v1/search?q=")).statusCode).toBe(400);
  });
});
