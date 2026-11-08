import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "./db.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
const body = {
  fromId: "tgold-a",
  toId: "tgold-b",
  amountIn: "1000000",
  accountId: "alice.testnet",
};
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
  app = buildApp(testAppDeps(t.db));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const post = (url: string, payload: unknown) =>
  app.inject({ method: "POST", url, payload: payload as object });

describe("quote routes", () => {
  it("creates a quote (201) and reads it back, matching the API contract", async () => {
    const res = await post("/v1/quotes", body);
    expect(res.statusCode).toBe(201);
    const quote = ENDPOINTS.createQuote.response.parse(res.json());
    expect(quote).toMatchObject({ amountOut: "999000000", state: "QUOTED" });
    expect(quote).not.toHaveProperty("signature");
    const read = await app.inject({ method: "GET", url: `/v1/quotes/${quote.id}` });
    expect(ENDPOINTS.getQuote.response.parse(read.json()).id).toBe(quote.id);
  });

  it("compares routes with a 200 for an available pair", async () => {
    const res = await post("/v1/routes/compare", { fromId: "tgold-a", toId: "tgold-b" });
    expect(res.statusCode).toBe(200);
    expect(ENDPOINTS.compareRoutes.response.parse(res.json()).routes[0]?.executable).toBe(true);
  });

  it("answers a refusal with 422 and a reason code", async () => {
    const base = testAppDeps(t.db);
    const chain = { ...base.quotes.chain, getInventory: async () => "0" };
    const empty = buildApp({ ...base, quotes: { ...base.quotes, chain } });
    const res = await empty.inject({ method: "POST", url: "/v1/quotes", payload: body });
    expect(res.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("INSUFFICIENT_INVENTORY");
    await empty.close();
  });

  it.each([
    ["an amount with a leading zero", { ...body, amountIn: "01" }],
    ["an amount that is a JSON number", { ...body, amountIn: 1000000 }],
    ["an unknown field", { ...body, extra: true }],
    ["a missing account", { fromId: "tgold-a", toId: "tgold-b", amountIn: "1" }],
  ])("rejects %s with a structured VALIDATION_ERROR", async (_name, payload) => {
    const res = await post("/v1/quotes", payload);
    expect(res.statusCode).toBe(400);
    const error = ApiErrorSchema.parse(res.json());
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.length).toBeGreaterThan(0);
  });

  it("returns 400 for a malformed quote id and 404 for an unknown one", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/quotes/not-a-uuid" })).statusCode).toBe(
      400,
    );
    const missing = await app.inject({
      method: "GET",
      url: "/v1/quotes/00000000-0000-4000-8000-000000000000",
    });
    expect([missing.statusCode, ApiErrorSchema.parse(missing.json()).code]).toEqual([
      404,
      "NOT_FOUND",
    ]);
  });
});
