import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { testAppDeps } from "./helpers.ts";

const WEB = "https://app.pontis.example";
let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  app = buildApp(testAppDeps(t.db, { security: { corsOrigins: [WEB] } }));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

describe("CORS", () => {
  it("lets the web origin read and reports the headers a browser client needs", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/health", headers: { origin: WEB } });
    expect(res.headers["access-control-allow-origin"]).toBe(WEB);
    expect(res.headers["access-control-expose-headers"]).toContain("retry-after");
  });

  it("gives other origins no permission", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://evil.example" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers the preflight of a conversion request, allowing the idempotency and auth headers only from the web origin", async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: "OPTIONS",
        url: "/v1/conversions",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,idempotency-key",
        },
      });
    const ok = await preflight(WEB);
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-headers"]).toContain("idempotency-key");
    expect(ok.headers["access-control-allow-methods"]).toBe("GET, POST, OPTIONS");
    expect(
      (await preflight("https://evil.example")).headers["access-control-allow-origin"],
    ).toBeUndefined();
  });
});

describe("response headers", () => {
  it("marks every answer nosniff, 404s included, and keeps admin answers out of shared caches", async () => {
    const missing = await app.inject({ method: "GET", url: "/v1/nope" });
    expect([missing.statusCode, missing.headers["x-content-type-options"]]).toEqual([
      404,
      "nosniff",
    ]);
    const admin = await app.inject({ method: "GET", url: "/v1/admin/reconciliation" });
    expect([admin.statusCode, admin.headers["cache-control"]]).toEqual([401, "no-store"]);
    expect(
      (await app.inject({ method: "GET", url: "/v1/health" })).headers["cache-control"],
    ).toBeUndefined();
  });
});
