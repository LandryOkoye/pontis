import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { navPoints } from "@pontis/db";
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
  await t.db.insert(navPoints).values(
    ["1.00", "1.01", "1.02"].map((nav, i) => ({
      representationId: "tgold-b",
      ts: new Date(NOW.getTime() - (2 - i) * 3_600_000),
      nav,
      currency: "USD",
      source: "simulated_feed" as const,
      simulated: true,
    })),
  );
  app = buildApp(testAppDeps(t.db, { now: () => NOW }));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("GET /v1/compare", () => {
  it("compares price, NAV premium and the market ratio against parity, like for like", async () => {
    const res = ENDPOINTS.compareAssets.response.parse(
      (await get("/v1/compare?ids=tgold-b,tgold-a&data=simulated")).json(),
    );
    expect(res.items.map((i) => i.id)).toEqual(["tgold-b", "tgold-a"]);
    // tgold-b: price 2 against a NAV of 1.02 is a premium of 9607 bps (truncated).
    expect(res.items[0]).toMatchObject({ navPerToken: "1.02", premiumToNavBps: 9607 });
    expect(res.items[1]).toMatchObject({ navPerToken: null, premiumToNavBps: null });
    // One A is ten B by unit definitions; the market says 110 / 2 = 55.
    expect(res.pairs.find((p) => p.fromId === "tgold-a")).toEqual({
      fromId: "tgold-a",
      toId: "tgold-b",
      parityRatio: "10",
      impliedRatio: "55",
      deviationBps: 45_000,
      simulated: true,
    });
    expect(res.pairs.find((p) => p.fromId === "tgold-b")).toMatchObject({
      parityRatio: "0.1",
      impliedRatio: "0.01818181",
      deviationBps: -8181,
    });
  });

  it("withholds a ratio between a real and a simulated price", async () => {
    const res = ENDPOINTS.compareAssets.response.parse(
      (await get("/v1/compare?ids=tgold-a,tgold-b")).json(),
    );
    // tgold-a has a real price, tgold-b only a simulated one.
    expect(
      res.pairs.map((p) => [p.parityRatio, p.impliedRatio, p.deviationBps, p.simulated]),
    ).toEqual([
      ["10", null, null, null],
      ["0.1", null, null, null],
    ]);
  });

  it("is 404 naming the unknown assets and 400 for a bad list", async () => {
    const missing = await get("/v1/compare?ids=tgold-a,ghost");
    expect(missing.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(missing.json()).message).toContain("ghost");
    for (const ids of ["tgold-a", "a,b,c,d,e,f,g"]) {
      expect((await get(`/v1/compare?ids=${ids}`)).statusCode).toBe(400);
    }
  });
});
