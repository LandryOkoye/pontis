import { auditLog } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminActor } from "../src/admin/audit.ts";
import { buildApp } from "../src/app.ts";
import { testAppDeps } from "./helpers.ts";
import { NOW, seedRegistry } from "./metrics-helpers.ts";

const KEY = "0123456789abcdef-admin-key";
let t: TestDb;
let app: FastifyInstance;
let open: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db);
  const deps = { now: () => NOW, chainHeight: async () => 10 };
  app = buildApp(testAppDeps(t.db, { ...deps, adminApiKey: KEY }));
  open = buildApp(testAppDeps(t.db, deps));
});
afterAll(async () => {
  await app.close();
  await open.close();
  await t.drop();
});

const get = (url: string, authorization?: string, server = app) =>
  server.inject({ method: "GET", url, headers: authorization ? { authorization } : {} });
const audits = async () =>
  (await t.db.select().from(auditLog)).map((r) => [r.actor, r.action, r.subject]);

describe("GET /v1/metrics/protocol", () => {
  it("is public, cached for 30 s with an ETag, and answers 304 to a matching one", async () => {
    const res = await get("/v1/metrics/protocol");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=30");
    expect(res.json().asOf).toBe(NOW.toISOString());
    const again = await app.inject({
      method: "GET",
      url: "/v1/metrics/protocol",
      headers: { "if-none-match": res.headers.etag as string },
    });
    expect([again.statusCode, again.body]).toEqual([304, ""]);
  });

  it("leaves the other public reads on the 5 s lifetime", async () => {
    expect((await get("/v1/issuers")).headers["cache-control"]).toContain("max-age=5");
  });
});

describe.each([
  ["/v1/admin/metrics", "admin.metrics.read"],
  ["/metrics", "admin.prometheus.read"],
])("GET %s", (path, action) => {
  it("refuses a missing, wrong or unconfigured key with 401 and audits each as anonymous", async () => {
    const before = (await audits()).length;
    for (const res of [
      await get(path),
      await get(path, "Bearer not-the-key-at-all-0000"),
      await get(path, `Bearer ${KEY}`, open),
    ])
      expect([res.statusCode, res.json().code]).toEqual([401, "UNAUTHORIZED"]);
    const added = (await audits()).slice(before);
    expect(added).toEqual(Array(3).fill(["anonymous", "admin.auth_failed", path]));
  });

  it("answers the right key, audits it under the key's fingerprint and never caches", async () => {
    const res = await get(path, `Bearer ${KEY}`);
    expect(res.statusCode).toBe(200);
    expect(await audits()).toContainEqual([adminActor(KEY), action, path]);
    expect(res.headers.etag).toBeUndefined();
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("GET /metrics", () => {
  it("is Prometheus text format 0.0.4", async () => {
    const res = await get("/metrics", `Bearer ${KEY}`);
    expect(res.headers["content-type"]).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(res.body).toContain("# TYPE pontis_conversion_success_rate gauge");
  });
});
