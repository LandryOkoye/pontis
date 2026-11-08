import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
  app = buildApp(testAppDeps(t.db));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const HASH = "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T";
const newQuote = async () =>
  (
    await app.inject({
      method: "POST",
      url: "/v1/quotes",
      payload: {
        fromId: "tgold-a",
        toId: "tgold-b",
        amountIn: "1000000",
        accountId: "alice.testnet",
      },
    })
  ).json() as { id: string };
const convert = (quoteId: string, key?: string) =>
  app.inject({
    method: "POST",
    url: "/v1/conversions",
    headers: key ? { "idempotency-key": key } : {},
    payload: { quoteId },
  });

describe("conversion routes", () => {
  it("accepts a quote (201), replays the same key, and conflicts on a second key", async () => {
    const q = await newQuote();
    const first = await convert(q.id, "route-key-0001");
    expect(first.statusCode).toBe(201);
    const plan = ENDPOINTS.createConversion.response.parse(first.json());
    expect(plan.actions[0]).toMatchObject({ methodName: "ft_transfer_call", deposit: "1" });
    expect((await convert(q.id, "route-key-0001")).json()).toEqual(first.json());
    const other = await convert(q.id, "route-key-0002");
    expect([other.statusCode, ApiErrorSchema.parse(other.json()).code]).toEqual([
      409,
      "QUOTE_ALREADY_USED",
    ]);
  });

  it("requires a well-formed Idempotency-Key header", async () => {
    const q = await newQuote();
    for (const res of [await convert(q.id), await convert(q.id, "short")]) {
      expect(res.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("VALIDATION_ERROR");
    }
  });

  it("reports the submitted hash and serves the transaction by id and by account", async () => {
    const q = await newQuote();
    const plan = (await convert(q.id, "route-key-0003")).json() as { conversionId: string };
    const sub = await app.inject({
      method: "POST",
      url: `/v1/conversions/${plan.conversionId}/submitted`,
      payload: { txHash: HASH },
    });
    expect(sub.statusCode).toBe(200);
    expect(ENDPOINTS.markConversionSubmitted.response.parse(sub.json())).toMatchObject({
      state: "SUBMITTED",
      txHash: HASH,
    });
    const one = await app.inject({ method: "GET", url: `/v1/transactions/${plan.conversionId}` });
    expect(ENDPOINTS.getTransaction.response.parse(one.json()).id).toBe(plan.conversionId);
    const list = await app.inject({
      method: "GET",
      url: "/v1/transactions?account=alice.testnet&limit=100",
    });
    expect(
      ENDPOINTS.listTransactions.response.parse(list.json()).items.length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("rejects a bad hash, a missing account and an unknown transaction with structured errors", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/v1/conversions/00000000-0000-4000-8000-000000000000/submitted",
      payload: { txHash: "x" },
    });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/v1/transactions" })).statusCode).toBe(400);
    const missing = await app.inject({
      method: "GET",
      url: "/v1/transactions/00000000-0000-4000-8000-000000000000",
    });
    expect([missing.statusCode, ApiErrorSchema.parse(missing.json()).code]).toEqual([
      404,
      "NOT_FOUND",
    ]);
  });
});
