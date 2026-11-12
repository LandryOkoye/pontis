import { ENDPOINTS } from "@pontis/api-types";
import { navPoints } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { NOW, seedMarket } from "./market-helpers.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
let later: FastifyInstance;
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
  later = buildApp(testAppDeps(t.db, { now: () => new Date(NOW.getTime() + 20 * 60_000) }));
});
afterAll(async () => {
  await app.close();
  await later.close();
  await t.drop();
});

const get = (url: string, on: FastifyInstance = app) => on.inject({ method: "GET", url });

describe("GET /v1/issuers/leaderboard", () => {
  it("ranks issuers by market cap and gives no reliability score", async () => {
    const board = ENDPOINTS.getIssuerLeaderboard.response.parse(
      (await get("/v1/issuers/leaderboard?data=simulated")).json(),
    );
    expect(board.items.map((i) => [i.rank, i.issuer.id, i.totalMarketCap])).toEqual([
      [1, "synthetic-issuer-a", "165000"],
      [2, "synthetic-issuer-b", "18000"],
    ]);
    expect(board.items.every((i) => i.reliabilityScore === null)).toBe(true);
  });

  it("leaves the cap null, not zero, when the data class has no supply", async () => {
    const board = ENDPOINTS.getIssuerLeaderboard.response.parse(
      (await get("/v1/issuers/leaderboard?data=real")).json(),
    );
    expect(board.items.map((i) => [i.issuer.id, i.totalMarketCap, i.simulated])).toEqual([
      ["synthetic-issuer-a", null, null],
      ["synthetic-issuer-b", null, null],
    ]);
    // The static path is not swallowed by /v1/issuers/{id}.
    expect((await get("/v1/issuers/synthetic-issuer-a")).statusCode).toBe(200);
  });
});

describe("GET /v1/status", () => {
  it("reports fresh prices and jobs, route health, and null for what does not exist yet", async () => {
    const s = ENDPOINTS.getStatus.response.parse((await get("/v1/status")).json());
    expect(s.prices.simulated).toMatchObject({ ageSeconds: 0, stale: false });
    expect(s.prices.real).toMatchObject({ ageSeconds: 0, stale: false });
    expect(s.marketJobs).toMatchObject({ ageSeconds: 0, stale: false });
    expect(s.routes).toEqual({ approved: 1, suspended: 0, proposed: 0 });
    expect([s.reserves, s.bridge, s.incidents]).toEqual([null, null, []]);
    expect([s.health.database, s.health.status]).toEqual([true, "degraded"]);
  });

  it("marks prices and jobs stale once they are older than their thresholds", async () => {
    const s = ENDPOINTS.getStatus.response.parse((await get("/v1/status", later)).json());
    expect([s.prices.simulated.stale, s.prices.simulated.ageSeconds]).toEqual([true, 1_200]);
    expect(s.marketJobs.stale).toBe(true);
  });
});
