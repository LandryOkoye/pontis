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
beforeAll(async () => {
  t = await createTestDb();
  await seedMarket(t.db);
  await t.db.insert(navPoints).values(
    [48, 24, 0].map((h, i) => ({
      representationId: "tgold-b",
      ts: new Date(NOW.getTime() - h * 3_600_000),
      nav: `1.0${i}`,
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

const window = "from=2026-11-10T06:00:00.000Z&to=2026-11-11T13:00:00.000Z&interval=1h";
const get = (path: string) => app.inject({ method: "GET", url: `/v1/assets/${path}` });

describe("NAV chart", () => {
  it("carries the last NAV forward, marks buckets with no print as filled and starts at the first print", async () => {
    const chart = ENDPOINTS.getAssetNavChart.response.parse(
      (
        await get(
          "tgold-b/charts/nav?from=2026-11-09T12:00:00.000Z&to=2026-11-11T13:00:00.000Z&interval=4h&data=simulated",
        )
      ).json(),
    );
    // Prints 48 h, 24 h and 0 h before NOW (1, 1.01, 1.02); thirteen 4 h buckets from the first.
    const expected = (nav: string) => [[nav, false], ...Array(5).fill([nav, true])];
    expect(chart.points.map((p) => [p.nav, p.filled])).toEqual([
      ...expected("1"),
      ...expected("1.01"),
      ["1.02", false],
    ]);
    expect(chart.filledPoints).toBe(10);
  });

  it("is empty for an asset with no NAV", async () => {
    const chart = ENDPOINTS.getAssetNavChart.response.parse(
      (await get(`tgold-a/charts/nav?${window}`)).json(),
    );
    expect([chart.points, chart.simulated]).toEqual([[], false]);
  });
});

describe("supply chart", () => {
  it("sums chains, starts at the first snapshot and labels the series simulated", async () => {
    const chart = ENDPOINTS.getAssetSupplyChart.response.parse(
      (await get(`tgold-a/charts/supply?${window}&data=simulated`)).json(),
    );
    // Snapshots 5 h before NOW on two chains: 1000000000 + 500000000.
    expect(chart.points[0]).toMatchObject({ supply: "1500000000", simulated: true, filled: false });
    expect(chart.points.every((p) => p.supply === "1500000000")).toBe(true);
    expect(chart.points.slice(1).every((p) => p.filled)).toBe(true);
  });
});
