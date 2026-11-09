import { auditLog } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminActor } from "../src/admin/audit.ts";
import { buildApp } from "../src/app.ts";
import { testAppDeps } from "./helpers.ts";

const KEY = "0123456789abcdef-admin-key";
let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  app = buildApp(testAppDeps(t.db, { adminApiKey: KEY }));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const call = (authorization?: string) =>
  app.inject({
    method: "GET",
    url: "/v1/admin/reconciliation?probe=1",
    remoteAddress: "203.0.113.9",
    headers: authorization ? { authorization } : {},
  });
const rows = () => t.db.select().from(auditLog);

describe("admin audit trail", () => {
  it("records a refused call as anonymous, with the path and no credential or address", async () => {
    await call("Bearer not-the-key-at-all-0000");
    const [row] = await rows();
    expect([row?.actor, row?.action, row?.subject]).toEqual([
      "anonymous",
      "admin.auth_failed",
      "/v1/admin/reconciliation",
    ]);
    const stored = JSON.stringify(row);
    for (const leaked of ["not-the-key-at-all-0000", "203.0.113.9", KEY])
      expect(stored).not.toContain(leaked);
  });

  it("records an authorized read under a fingerprint of the key, not the key", async () => {
    await call(`Bearer ${KEY}`);
    const read = (await rows()).find((r) => r.action === "admin.reconciliation.read");
    expect(read?.actor).toBe(adminActor(KEY));
    expect(read?.actor).toMatch(/^admin:[0-9a-f]{8}$/);
    expect(JSON.stringify(read)).not.toContain(KEY);
  });

  it("gives different keys different fingerprints", () => {
    expect(adminActor("a".repeat(16))).not.toBe(adminActor("b".repeat(16)));
  });
});
