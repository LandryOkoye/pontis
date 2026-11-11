import { ENDPOINTS } from "@pontis/api-types";
import { trades } from "@pontis/db";
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
  const trade = (n: number, simulated: boolean) => ({
    ref: `extra:${n}`,
    kind: "conversion",
    ts: new Date(NOW.getTime() - n * 60_000),
    accountId: "bob.test",
    fromId: "tgold-b",
    toId: "tgold-a",
    amountIn: String(n),
    amountOut: String(n),
    fee: "0",
    source: simulated ? ("simulated_feed" as const) : ("pontis_trades" as const),
    simulated,
  });
  await t.db.insert(trades).values([trade(10, false), trade(20, true)]);
  app = buildApp(testAppDeps(t.db, { now: () => NOW }));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const get = async (path: string) => app.inject({ method: "GET", url: `/v1/assets/${path}` });

describe("asset activity", () => {
  it("lists conversions where the asset is either side, newest first, each labelled", async () => {
    const page = ENDPOINTS.getAssetActivity.response.parse((await get("tgold-a/activity")).json());
    expect(page.items.map((i) => i.amountIn)).toEqual(["10", "20", "5000000"]);
    expect(page.items.map((i) => i.simulated)).toEqual([false, true, true]);
    expect(page.items.every((i) => (i.source === "pontis_trades") === !i.simulated)).toBe(true);
    // tgold-b is the other side of the same conversions.
    const b = ENDPOINTS.getAssetActivity.response.parse((await get("tgold-b/activity")).json());
    expect(b.items).toHaveLength(3);
  });

  it("filters by data class and pages with a cursor tied to its query", async () => {
    const real = ENDPOINTS.getAssetActivity.response.parse(
      (await get("tgold-a/activity?data=real")).json(),
    );
    expect(real.items.map((i) => i.amountIn)).toEqual(["10"]);
    const first = ENDPOINTS.getAssetActivity.response.parse(
      (await get("tgold-a/activity?limit=2")).json(),
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = ENDPOINTS.getAssetActivity.response.parse(
      (await get(`tgold-a/activity?limit=2&cursor=${first.nextCursor}`)).json(),
    );
    expect([second.items.map((i) => i.amountIn), second.nextCursor]).toEqual([["5000000"], null]);
    expect((await get(`tgold-a/activity?limit=3&cursor=${first.nextCursor}`)).statusCode).toBe(400);
  });
});
