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

const window = "from=2026-11-10T06:00:00.000Z&to=2026-11-11T13:00:00.000Z&interval=1h";
const get = (path: string) => app.inject({ method: "GET", url: `/v1/assets/${path}` });

describe("price chart", () => {
  it("serves ascending hourly candles, flags filled buckets and says every point is simulated", async () => {
    const res = await get(`tgold-a/charts/price?${window}&data=simulated`);
    const chart = ENDPOINTS.getAssetPriceChart.response.parse(res.json());
    expect([chart.interval, chart.simulated, chart.source]).toEqual([
      "1h",
      true,
      ["simulated_feed"],
    ]);
    const closes = chart.points.map((p) => Number(p.close));
    expect(closes[0]).toBe(100);
    expect(chart.points.map((p) => p.t)).toEqual([...chart.points.map((p) => p.t)].sort());
    expect(chart.filledPoints).toBe(chart.points.filter((p) => p.filled).length);
    expect(chart.filledPoints).toBeGreaterThan(20);
    expect(chart.points.every((p) => p.simulated)).toBe(true);
  });

  it("keeps real and simulated apart: data=real has real candles only, all prefers real per bucket", async () => {
    const real = ENDPOINTS.getAssetPriceChart.response.parse(
      (await get(`tgold-a/charts/price?${window}&data=real`)).json(),
    );
    expect(real.simulated).toBe(false);
    expect(real.source).toEqual(["pontis_trades"]);
    expect(real.points.every((p) => !p.simulated)).toBe(true);
    const all = ENDPOINTS.getAssetPriceChart.response.parse(
      (await get(`tgold-a/charts/price?${window}`)).json(),
    );
    expect(all.simulated).toBe(true);
    expect(all.source).toEqual(["pontis_trades", "simulated_feed"]);
    expect(all.points.some((p) => !p.simulated)).toBe(true);
    expect(all.points.some((p) => p.simulated)).toBe(true);
    const none = ENDPOINTS.getAssetPriceChart.response.parse(
      (await get(`tgold-b/charts/price?${window}&data=real`)).json(),
    );
    expect([none.points, none.simulated, none.source]).toEqual([[], false, []]);
  });

  it("defaults to the 500 buckets before now and refuses ranges that are too large or inverted", async () => {
    const dflt = ENDPOINTS.getAssetPriceChart.response.parse(
      (await get("tgold-a/charts/price?interval=1d&data=simulated")).json(),
    );
    expect(dflt.to).toBe(NOW.toISOString());
    const big = await get("tgold-a/charts/price?interval=1m&from=2026-01-01T00:00:00.000Z");
    expect(big.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(big.json()).message).toContain("buckets");
    const inverted = await get(
      "tgold-a/charts/price?from=2026-11-11T12:00:00.000Z&to=2026-11-11T11:00:00.000Z",
    );
    expect(inverted.statusCode).toBe(400);
  });

  it("is 404 for an unknown asset on every chart", async () => {
    for (const chart of ["price", "nav", "supply", "volume"]) {
      const res = await get(`ghost/charts/${chart}`);
      expect([chart, res.statusCode]).toEqual([chart, 404]);
    }
  });
});

describe("volume chart", () => {
  it("reports units moved and trade counts per bucket", async () => {
    const chart = ENDPOINTS.getAssetVolumeChart.response.parse(
      (await get(`tgold-a/charts/volume?${window}&data=simulated`)).json(),
    );
    expect(chart.points.reduce((sum, p) => sum + BigInt(p.volumeBase), 0n)).toBe(5_000_000n);
    expect(chart.points.reduce((sum, p) => sum + p.trades, 0)).toBe(1);
  });
});
