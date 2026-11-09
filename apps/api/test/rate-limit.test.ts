import { ApiErrorSchema } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { classify } from "../src/security/rate-limit.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  app = buildApp(
    testAppDeps(t.db, {
      adminApiKey: "0123456789abcdef-admin-key",
      security: { corsOrigins: [], rateLimits: { read: 5, write: 2, admin: 3, windowMs: 60_000 } },
    }),
  );
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const call = (method: "GET" | "POST", url: string, ip: string, payload?: object) =>
  app.inject({ method, url, remoteAddress: ip, ...(payload ? { payload } : {}) });

describe("classify", () => {
  it("treats admin paths as admin whatever the method, other GETs as reads and the rest as writes", () => {
    expect(classify({ method: "GET", url: "/v1/admin/reconciliation?x=1" })).toBe("admin");
    expect(classify({ method: "POST", url: "/v1/admin/anything" })).toBe("admin");
    expect(classify({ method: "GET", url: "/v1/assets" })).toBe("read");
    expect(classify({ method: "OPTIONS", url: "/v1/quotes" })).toBe("read");
    expect(classify({ method: "POST", url: "/v1/quotes" })).toBe("write");
  });
});

describe("rate limiting", () => {
  it("answers the request after the allowance with a structured 429 and Retry-After", async () => {
    for (let i = 0; i < 5; i++)
      expect((await call("GET", "/v1/health", "10.0.0.1")).statusCode).toBe(200);
    const res = await call("GET", "/v1/health", "10.0.0.1");
    expect(res.statusCode).toBe(429);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("RATE_LIMITED");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("counts each client and each class separately", async () => {
    expect((await call("GET", "/v1/health", "10.0.0.2")).statusCode).toBe(200);
    for (let i = 0; i < 2; i++) await call("POST", "/v1/routes/compare", "10.0.0.3", {});
    expect((await call("POST", "/v1/routes/compare", "10.0.0.3", {})).statusCode).toBe(429);
    expect((await call("GET", "/v1/health", "10.0.0.3")).statusCode).toBe(200);
  });

  it("stops guesses at the admin key after the admin allowance, even for the right key later", async () => {
    const guess = (key: string) =>
      app.inject({
        method: "GET",
        url: "/v1/admin/reconciliation",
        remoteAddress: "10.0.0.4",
        headers: { authorization: `Bearer ${key}` },
      });
    for (let i = 0; i < 3; i++) expect((await guess(`wrong-guess-${i}`)).statusCode).toBe(401);
    expect((await guess("0123456789abcdef-admin-key")).statusCode).toBe(429);
  });
});
