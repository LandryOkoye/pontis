import { ENDPOINTS } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { CATALOGUE } from "../src/metrics/catalogue.ts";
import { testAppDeps } from "./helpers.ts";
import { HOUR, NOW, SPEC_KEYS, ago, seedRegistry } from "./metrics-helpers.ts";
import { addConversion, addQuote, addReconciliationAudit } from "./metrics-seed.ts";

const KEY = "0123456789abcdef-admin-key";
let t: TestDb;
let app: FastifyInstance;
let flagged: string;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db);
  for (const ms of [HOUR, 2 * HOUR]) {
    const id = await addQuote(t.db, { state: "SETTLED", updatedAt: ago(ms), amountIn: "1000" });
    await addConversion(t.db, id, { settledAt: ago(ms), submittedAt: ago(ms + 5000) });
  }
  await addQuote(t.db, { state: "FAILED", updatedAt: ago(HOUR) });
  flagged = await addQuote(t.db, { state: "REQUIRES_RECONCILIATION", updatedAt: ago(HOUR) });
  await addReconciliationAudit(t.db, flagged, ago(HOUR));
  app = buildApp(
    testAppDeps(t.db, { now: () => NOW, adminApiKey: KEY, chainHeight: async () => 10 }),
  );
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const publicView = async () =>
  ENDPOINTS.getProtocolMetrics.response.parse((await app.inject("/v1/metrics/protocol")).json());
const adminView = async () =>
  ENDPOINTS.getAdminMetrics.response.parse(
    (
      await app.inject({ url: "/v1/admin/metrics", headers: { authorization: `Bearer ${KEY}` } })
    ).json(),
  );

describe("protocol metrics body", () => {
  it("lists the spec's public keys, available or with the phase that unlocks them", async () => {
    const view = await publicView();
    expect(view.metrics.map((m) => m.key)).toEqual(
      CATALOGUE.filter((d) => d.audience === "public").map((d) => d.key),
    );
    for (const m of view.metrics)
      expect(m.available || m.availableFrom !== undefined, m.key).toBe(true);
    expect(view.metrics.find((m) => m.key === "volume_usd")?.availableFrom).toBe("phase 1");
  });

  it("holds aggregates only: no account, quote or per-representation data", async () => {
    const body = (await app.inject("/v1/metrics/protocol")).body;
    for (const leaked of [
      "alice.testnet",
      flagged,
      "tgold-a",
      "tgold-b",
      "volume_input",
      "fees_collected",
      "vault_inventory",
      "requiresReconciliationQuoteIds",
    ])
      expect(body, leaked).not.toContain(leaked);
  });

  it("computes the seeded values", async () => {
    const byKey = new Map((await publicView()).metrics.map((m) => [m.key, m]));
    // 2 settled, 1 failed, 1 requires-reconciliation in 24 h.
    expect(byKey.get("conversion_success_rate")?.values?.["24h"]).toBe("0.500000");
    expect(byKey.get("requires_reconciliation_rate")?.values?.["24h"]).toBe("0.250000");
    expect(byKey.get("refund_rate")?.values?.["24h"]).toBeNull();
    expect(byKey.get("indexer_lag_blocks")?.value).toBeNull();
    expect(byKey.get("representations_active")?.value).toBe(2);
    expect(byKey.get("assets_third_party_attested_pct")?.value).toBe("0.000000");
  });
});

describe("admin metrics body", () => {
  it("covers every key of the spec between metrics and breakdowns", async () => {
    const view = await adminView();
    const keys = [...view.metrics, ...view.breakdowns].map((m) => m.key);
    expect(keys.sort()).toEqual([...SPEC_KEYS].sort());
  });

  it("adds per-representation amounts and the open quote IDs", async () => {
    const view = await adminView();
    expect(view.requiresReconciliationQuoteIds).toEqual([flagged]);
    const by = new Map(view.breakdowns.map((b) => [b.key, b]));
    expect(by.get("volume_input_base_units")?.values?.["24h"]).toEqual({ "tgold-a": "2000" });
    expect(by.get("fees_collected_base_units")?.values?.["24h"]).toEqual({ "tgold-b": "20" });
    expect(by.get("vault_inventory_base_units")?.value).toEqual({
      "tgold-a": "1000000000",
      "tgold-b": "1000000000000",
    });
    const m = new Map(view.metrics.map((x) => [x.key, x]));
    expect(m.get("requires_reconciliation_open")?.value).toBe(1);
    expect(m.get("submit_to_settle_latency_seconds_p95")?.values?.["24h"]).toBe("5.000");
  });

  it("answers with a null lag when the chain head cannot be read", async () => {
    const failing = buildApp(
      testAppDeps(t.db, {
        adminApiKey: KEY,
        chainHeight: async () => Promise.reject(new Error("rpc down")),
      }),
    );
    const res = await failing.inject({
      url: "/v1/admin/metrics",
      headers: { authorization: `Bearer ${KEY}` },
    });
    await failing.close();
    expect(res.statusCode).toBe(200);
    expect(
      res.json().metrics.find((m: { key: string }) => m.key === "indexer_lag_blocks").value,
    ).toBeNull();
  });
});

describe("an empty database", () => {
  it("serves null rates and zero counts, not 0 rates", async () => {
    const empty = await createTestDb();
    const bare = buildApp(testAppDeps(empty.db, { now: () => NOW }));
    const view = ENDPOINTS.getProtocolMetrics.response.parse(
      (await bare.inject("/v1/metrics/protocol")).json(),
    );
    await bare.close();
    await empty.drop();
    const by = new Map(view.metrics.map((m) => [m.key, m]));
    expect(by.get("conversion_success_rate")?.values).toEqual({
      "24h": null,
      "7d": null,
      all: null,
    });
    expect(by.get("assets_registered")?.value).toBe(0);
  });
});
