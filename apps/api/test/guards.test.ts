// Route guards in the API (ADR 0016): a quote copies the fee the contract computes for the
// amount, every guard refusal has its own reason code, and the breakdown endpoint labels prices.

import { ENDPOINTS } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteGuards, ChainRouteView } from "@pontis/near-client";
import { keyFromSeed } from "@pontis/quote-engine";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { compareRoutes } from "../src/quotes/compare.ts";
import { createQuote, type QuoteDeps } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { errorCodeOf, testAppDeps, unguarded } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-11-07T18:00:00Z");
const terms = { ratio: { num: "1000", den: "1" }, compatibility_version: 2, policy_version: 1 };
const open: ChainRouteView = { executable: true, refusal: null, terms, next_freeze_ms: null };
const line = (name: string, passed: boolean, detail: string) => ({ name, passed, detail });
const guarded = (over: Partial<ChainRouteGuards> = {}): ChainRouteGuards => ({
  executable: true,
  checks: [
    line("route", true, "executable"),
    line("guard", true, "configured"),
    line("price_freshness", true, "tgold-a: 4000 ms old, limit 60000 ms"),
    line("circuit_breaker", true, "no violations"),
    line("amount_limits", true, "within limits"),
  ],
  fee_bps: 14,
  skew_bps: 4,
  degraded: false,
  ...over,
});
const chain = (over: Partial<QuoteChain> = {}): QuoteChain => ({
  ...unguarded({
    getRoute: async () => open,
    isAllowed: async () => true,
    getInventory: async () => "1000000000000",
    getFeeBps: async () => 10,
  }),
  ...over,
});
const deps = (over: Partial<QuoteChain> = {}): QuoteDeps => ({
  db: t.db,
  chain: chain(over),
  key: keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1)),
  coreId: "core.testnet",
  now: () => NOW,
});
const req = { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: "alice.testnet" };

describe("quotes under guards", () => {
  it("copies the fee the contract computes for this amount, skew included", async () => {
    const asked: (string | undefined)[] = [];
    const q = await createQuote(
      deps({
        getRouteGuards: async (_f, _t, amountIn) => {
          asked.push(amountIn);
          return guarded();
        },
      }),
      req,
    );
    expect(asked).toEqual(["1000000"]);
    expect(q.feeBps).toBe(14);
    expect([q.fee, q.amountOut]).toEqual(["1400000", "998600000"]);
  });

  it.each([
    ["a price that deviates", "price_deviation", "PRICE_DEVIATION"],
    ["a stale price", "price_stale", "PRICE_STALE"],
    ["a missing price", "price_missing", "PRICE_UNAVAILABLE"],
    ["an unusable price", "price_unavailable", "PRICE_UNAVAILABLE"],
  ])("refuses %s as %s", async (_name, refusal, code) => {
    const closed = async () =>
      ({
        executable: false,
        refusal,
        terms: null,
        next_freeze_ms: null,
      }) as unknown as ChainRouteView;
    expect(await errorCodeOf(createQuote(deps({ getRoute: closed }), req))).toBe(code);
  });

  it.each([
    ["AmountBelowMin", "AMOUNT_BELOW_MIN"],
    ["AmountAboveMax", "AMOUNT_ABOVE_MAX"],
    ["WindowLimitExceeded", "WINDOW_LIMIT_EXCEEDED"],
  ])("refuses an amount the guard limits (%s) as %s", async (detail, code) => {
    const view = guarded({
      executable: false,
      checks: [line("route", true, "executable"), line("amount_limits", false, detail)],
    });
    expect(await errorCodeOf(createQuote(deps({ getRouteGuards: async () => view }), req))).toBe(
      code,
    );
  });

  it("says a stale or missing price closes the route, and an open breaker is a suspension", async () => {
    const refused = async (checks: ReturnType<typeof line>[]) =>
      errorCodeOf(
        createQuote(
          deps({ getRouteGuards: async () => guarded({ executable: false, checks }) }),
          req,
        ),
      );
    expect(
      await refused([line("price_freshness", false, "tgold-a: 90000 ms old, limit 60000 ms")]),
    ).toBe("PRICE_STALE");
    expect(await refused([line("price_freshness", false, "tgold-b: no price")])).toBe(
      "PRICE_UNAVAILABLE",
    );
    expect(await refused([line("circuit_breaker", false, "3 violations, 1 trips")])).toBe(
      "RELATIONSHIP_SUSPENDED",
    );
  });

  it("route comparison gives the same verdict for the same amount", async () => {
    const view = guarded({
      executable: false,
      checks: [line("route", true, "executable"), line("amount_limits", false, "AmountAboveMax")],
    });
    const res = await compareRoutes(t.db, chain({ getRouteGuards: async () => view }), {
      fromId: "tgold-a",
      toId: "tgold-b",
      amount: "1000000",
    });
    expect(res.routes[0]).toMatchObject({ executable: false, reasonCode: "AMOUNT_ABOVE_MAX" });
  });
});

describe("GET /v1/routes/{fromId}/{toId}/guards", () => {
  let app: FastifyInstance;
  const price = (simulated: boolean) => ({
    price: "10000000000",
    currency: "USD",
    as_of_ms: NOW.getTime() - 4_000,
    submitted_ms: NOW.getTime() - 3_000,
    simulated,
    source: simulated ? "simulated_feed" : "pontis_trades",
    publisher_key: "ed25519:FgcwodK7aTtn3DgvqwPuSseKgTPcMpGmK6zdf7Ri9KXm",
  });
  beforeAll(() => {
    const base = testAppDeps(t.db);
    app = buildApp({
      ...base,
      quotes: {
        ...base.quotes,
        now: () => NOW,
        chain: chain({
          getRouteGuards: async () => guarded(),
          getPrice: async (id) => (id === "tgold-a" ? price(true) : null),
        }),
      },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns the breakdown with the reference price, its age and its simulated label", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/routes/tgold-a/tgold-b/guards?amount=1000000",
    });
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.getRouteGuards.response.parse(res.json());
    expect(body).toMatchObject({
      guarded: true,
      executable: true,
      feeBps: 14,
      skewBps: 4,
      amount: "1000000",
    });
    // Only the price the contract holds is listed; nothing is invented for the other side.
    expect(body.prices).toEqual([
      {
        representationId: "tgold-a",
        price: "100",
        currency: "USD",
        asOf: "2026-11-07T17:59:56.000Z",
        ageMs: 4_000,
        source: "simulated_feed",
        simulated: true,
      },
    ]);
  });

  it("answers 404 for an unknown asset and 400 for a malformed amount", async () => {
    const unknown = await app.inject({ method: "GET", url: "/v1/routes/nope/tgold-b/guards" });
    expect(unknown.statusCode).toBe(404);
    const bad = await app.inject({
      method: "GET",
      url: "/v1/routes/tgold-a/tgold-b/guards?amount=-1",
    });
    expect(bad.statusCode).toBe(400);
  });
});
