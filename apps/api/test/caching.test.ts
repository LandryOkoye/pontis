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

  it("gives protocol metrics a 30 s lifetime and leaves /metrics and admin metrics uncached", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/metrics/protocol" });
    expect([res.statusCode, res.headers["cache-control"]]).toEqual([200, "public, max-age=30"]);
    expect(res.headers.etag).toMatch(/^W\/"/);
    for (const url of ["/metrics", "/v1/admin/metrics"]) {
      const refused = await app.inject({ method: "GET", url });
      expect([url, refused.statusCode, refused.headers.etag]).toEqual([url, 401, undefined]);
      expect(refused.headers["cache-control"]).toBe("no-store");
    }
  });
});
