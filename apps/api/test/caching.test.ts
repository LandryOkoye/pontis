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

describe("public caching", () => {
  it("answers 304 to a matching ETag and never caches admin or health reads", async () => {
    const first = await app.inject({ method: "GET", url: "/v1/assets?data=simulated" });
    const etag = first.headers.etag as string;
    expect(etag).toMatch(/^W\/"/);
    expect(first.headers["cache-control"]).toContain("public");
    const again = await app.inject({
      method: "GET",
      url: "/v1/assets?data=simulated",
      headers: { "if-none-match": etag },
    });
    expect([again.statusCode, again.body]).toEqual([304, ""]);
    const other = await app.inject({
      method: "GET",
      url: "/v1/assets?data=real",
      headers: { "if-none-match": etag },
    });
    expect(other.statusCode).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/v1/health/live" })).headers.etag,
    ).toBeUndefined();
    expect(
      (await app.inject({ method: "GET", url: "/v1/admin/reconciliation" })).headers.etag,
    ).toBeUndefined();
  });
});
