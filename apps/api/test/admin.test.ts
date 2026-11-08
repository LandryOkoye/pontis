import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { conversions, quotes, reconciliationReport } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { acceptQuote } from "../src/conversions/accept.ts";
import { createQuote } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { testAppDeps } from "./helpers.ts";

const KEY = "0123456789abcdef-admin-key";
let t: TestDb;
let app: FastifyInstance;
let open: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
  app = buildApp(testAppDeps(t.db, { adminApiKey: KEY }));
  open = buildApp(testAppDeps(t.db));
});
afterAll(async () => {
  await app.close();
  await open.close();
  await t.drop();
});

const get = (server: FastifyInstance, authorization?: string) =>
  server.inject({
    method: "GET",
    url: "/v1/admin/reconciliation",
    headers: authorization ? { authorization } : {},
  });

describe("GET /v1/admin/reconciliation authorization", () => {
  it("refuses a missing, malformed or wrong key with a structured 401", async () => {
    for (const header of [undefined, "Bearer wrong", KEY, `Basic ${KEY}`, "Bearer "]) {
      const res = await get(app, header);
      expect(res.statusCode, String(header)).toBe(401);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("UNAUTHORIZED");
    }
  });

  it("is closed to everyone when no admin key is configured, even to an empty bearer", async () => {
    for (const header of [undefined, "Bearer ", `Bearer ${KEY}`]) {
      expect((await get(open, header)).statusCode).toBe(401);
    }
  });
});

describe("GET /v1/admin/reconciliation report", () => {
  it("says NEVER_RUN before the reconciler has finished once", async () => {
    const res = await get(app, `Bearer ${KEY}`);
    expect(res.statusCode).toBe(200);
    expect(ENDPOINTS.getReconciliation.response.parse(res.json())).toMatchObject({
      status: "NEVER_RUN",
      ranAt: null,
      findings: [],
    });
  });

  it("serves the stored run and lists quotes waiting for reconciliation", async () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const quote = await createQuote(
      { db: t.db, ...testAppDeps(t.db).quotes, now: () => now },
      { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: "alice.testnet" },
    );
    const { conversionId } = await acceptQuote(
      {
        db: t.db,
        chain: { isRegistered: async () => true },
        coreId: "core.testnet",
        now: () => now,
      },
      quote.id,
      "admin-test-key-1",
    );
    await t.db
      .update(quotes)
      .set({ state: "REQUIRES_RECONCILIATION" })
      .where(eq(quotes.id, quote.id));
    await t.db
      .update(conversions)
      .set({ failureReason: "No settlement event" })
      .where(eq(conversions.id, conversionId));
    const run = {
      ranAt: now.toISOString(),
      findings: [
        {
          key: "vault:tgold-b:insolvent",
          kind: "VAULT_INSOLVENT" as const,
          severity: "critical" as const,
          subject: "tgold-b",
          message: "x",
          firstSeenAt: now.toISOString(),
        },
      ],
      vaults: [
        {
          representationId: "tgold-b",
          tokenAccountId: "tgold-b.testnet",
          inventory: "9",
          balance: "3",
        },
      ],
    };
    await t.db.insert(reconciliationReport).values({ name: "latest", report: run });

    const report = ENDPOINTS.getReconciliation.response.parse(
      (await get(app, `Bearer ${KEY}`)).json(),
    );
    expect(report).toMatchObject({
      status: "ATTENTION",
      ranAt: run.ranAt,
      findings: run.findings,
      vaults: run.vaults,
    });
    expect(report.requiresReconciliation).toEqual([
      {
        quoteId: quote.id,
        conversionId,
        reason: "No settlement event",
        flaggedAt: expect.any(String),
      },
    ]);
  });

  it("reports OK when the last run found nothing and nothing is waiting", async () => {
    await t.db
      .update(quotes)
      .set({ state: "SETTLED" })
      .where(eq(quotes.state, "REQUIRES_RECONCILIATION"));
    await t.db
      .update(reconciliationReport)
      .set({ report: { ranAt: "2026-11-09T12:05:00.000Z", findings: [], vaults: [] } });
    const report = ENDPOINTS.getReconciliation.response.parse(
      (await get(app, `Bearer ${KEY}`)).json(),
    );
    expect([report.status, report.requiresReconciliation]).toEqual(["OK", []]);
  });
});
