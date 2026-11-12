import { HealthSchema } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import { indexerCursor } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.ts";
import { INDEXER_CURSOR_NAME } from "../src/routes/health.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(indexerCursor);
});

const NOW = new Date("2026-11-10T12:00:00.000Z");
const THRESHOLDS = { staleAfterMs: 30_000, maxLagBlocks: 50, now: () => NOW };

async function seedCursor(blockHeight: number, heartbeatAgeMs: number) {
  await t.db.insert(indexerCursor).values({
    name: INDEXER_CURSOR_NAME,
    blockHeight,
    updatedAt: new Date(NOW.getTime() - heartbeatAgeMs),
  });
}

async function call(url: string, chainHeight: () => Promise<number>, db: Db = t.db) {
  const app = buildApp(testAppDeps(db, { chainHeight, health: THRESHOLDS }));
  const res = await app.inject({ method: "GET", url });
  await app.close();
  return res;
}

async function health(chainHeight: () => Promise<number>, db?: Db) {
  const res = await call("/v1/health", chainHeight, db);
  expect(res.statusCode).toBe(200);
  return HealthSchema.parse(res.json());
}

const rpcDown = () => Promise.reject(new Error("rpc down"));
/** A database whose probe fails and which must not be queried for the cursor. */
function brokenDb() {
  const select = vi.fn();
  const db = { execute: rpcDown, select } as unknown as Db;
  return { db, select };
}

describe("GET /v1/health", () => {
  it("is degraded, never ok, before an indexer has run", async () => {
    expect(await health(async () => 500)).toEqual({
      status: "degraded",
      chainHeight: 500,
      indexerLagBlocks: null,
      database: true,
      rpc: true,
      indexer: { state: "never_run", lagBlocks: null, lastHeartbeatAt: null, heartbeatAgeMs: null },
    });
  });

  it("is ok when the indexer's heartbeat is fresh and it is within the lag limit", async () => {
    await seedCursor(497, 1_500);
    expect(await health(async () => 500)).toEqual({
      status: "ok",
      chainHeight: 500,
      indexerLagBlocks: 3,
      database: true,
      rpc: true,
      indexer: {
        state: "running",
        lagBlocks: 3,
        lastHeartbeatAt: "2026-11-10T11:59:58.500Z",
        heartbeatAgeMs: 1_500,
      },
    });
  });

  it("never reports a negative lag, and the limit itself still counts as running", async () => {
    await seedCursor(450, 0);
    expect((await health(async () => 500)).indexer).toMatchObject({
      state: "running",
      lagBlocks: 50,
    });
    expect((await health(async () => 440)).indexerLagBlocks).toBe(0);
  });

  it("is degraded and lagging when the heartbeat is fresh but the indexer is over the lag limit", async () => {
    await seedCursor(100, 2_000);
    const body = await health(async () => 500);
    expect(body.status).toBe("degraded");
    expect(body.indexerLagBlocks).toBe(400);
    expect(body.indexer).toMatchObject({ state: "lagging", lagBlocks: 400, heartbeatAgeMs: 2_000 });
  });

  it("is degraded and stale when the heartbeat is older than the threshold, even with no lag", async () => {
    await seedCursor(500, 30_001);
    const body = await health(async () => 500);
    expect(body.status).toBe("degraded");
    expect(body.indexer).toMatchObject({ state: "stale", lagBlocks: 0, heartbeatAgeMs: 30_001 });
  });

  it("is stale in preference to lagging when both apply", async () => {
    await seedCursor(100, 120_000);
    expect((await health(async () => 500)).indexer?.state).toBe("stale");
  });

  it("is degraded, not an error, when the chain RPC is down, and cannot judge the lag", async () => {
    await seedCursor(497, 1_000);
    expect(await health(rpcDown)).toEqual({
      status: "degraded",
      chainHeight: null,
      indexerLagBlocks: null,
      database: true,
      rpc: false,
      indexer: {
        state: "running",
        lagBlocks: null,
        lastHeartbeatAt: "2026-11-10T11:59:59.000Z",
        heartbeatAgeMs: 1_000,
      },
    });
  });

  it("is degraded without reading the cursor when the database is unavailable", async () => {
    const { db, select } = brokenDb();
    expect(await health(async () => 500, db)).toEqual({
      status: "degraded",
      chainHeight: 500,
      indexerLagBlocks: null,
      database: false,
      rpc: true,
      indexer: null,
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("reports the database as down when the probe passes but the cursor read fails", async () => {
    const db = {
      execute: async () => [],
      select: () => {
        throw new Error("relation missing");
      },
    } as unknown as Db;
    expect(await health(async () => 500, db)).toMatchObject({
      status: "degraded",
      database: false,
      indexer: null,
    });
  });
});

describe("GET /v1/health/live", () => {
  it("answers 200 without touching the database or the RPC", async () => {
    const { db, select } = brokenDb();
    const chainHeight = vi.fn(rpcDown);
    const res = await call("/v1/health/live", chainHeight, db);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(chainHeight).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });
});

describe("GET /v1/health/ready", () => {
  it("is 200 with the health body when everything is running", async () => {
    await seedCursor(499, 1_000);
    const res = await call("/v1/health/ready", async () => 500);
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.parse(res.json()).status).toBe("ok");
  });

  it("is 200 but degraded for a lagging indexer: it still serves, and the body says why", async () => {
    await seedCursor(100, 1_000);
    const res = await call("/v1/health/ready", async () => 500);
    expect(res.statusCode).toBe(200);
    expect(HealthSchema.parse(res.json())).toMatchObject({
      status: "degraded",
      indexer: { state: "lagging" },
    });
  });

  it.each([
    ["the indexer has never run", null, false, false, "never_run"],
    ["the indexer is stale", 60_000, false, false, "stale"],
    ["the chain RPC is down", 1_000, true, false, "running"],
    ["the database is unavailable", null, false, true, undefined],
  ] as const)("is 503 when %s", async (_name, ageMs, rpcFails, dbFails, state) => {
    if (ageMs !== null) await seedCursor(500, ageMs);
    const height = rpcFails ? rpcDown : async () => 500;
    const res = await call("/v1/health/ready", height, dbFails ? brokenDb().db : t.db);
    expect(res.statusCode).toBe(503);
    expect(HealthSchema.parse(res.json()).indexer?.state).toBe(state);
  });
});
