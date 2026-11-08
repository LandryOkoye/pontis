import { HealthSchema } from "@pontis/api-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { indexerCursor } from "../src/db/schema/index.ts";
import { INDEXER_CURSOR_NAME } from "../src/routes/health.ts";
import { createTestDb, type TestDb } from "./db.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});

async function health(chainHeight: () => Promise<number>) {
  const app = buildApp(testAppDeps(t.db, { chainHeight }));
  const res = await app.inject({ method: "GET", url: "/v1/health" });
  await app.close();
  expect(res.statusCode).toBe(200);
  return HealthSchema.parse(res.json());
}

describe("GET /v1/health", () => {
  it("is ok with the chain height and no indexer lag before an indexer has run", async () => {
    expect(await health(async () => 500)).toEqual({
      status: "ok",
      chainHeight: 500,
      indexerLagBlocks: null,
    });
  });

  it("reports the indexer lag once a cursor exists, and never a negative lag", async () => {
    await t.db.insert(indexerCursor).values({ name: INDEXER_CURSOR_NAME, blockHeight: 497 });
    expect((await health(async () => 500)).indexerLagBlocks).toBe(3);
    expect((await health(async () => 490)).indexerLagBlocks).toBe(0);
  });

  it("is degraded, not an error, when the chain RPC is down", async () => {
    expect(await health(() => Promise.reject(new Error("rpc down")))).toEqual({
      status: "degraded",
      chainHeight: null,
      indexerLagBlocks: null,
    });
  });
});
