// Reserve refusals in the API (ADR 0020 section 5): a route refused for reserves has its own
// reason codes, in plain words that never claim backing, on quotes, comparison and the breakdown.

import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteGuards, ChainRouteView } from "@pontis/near-client";
import { keyFromSeed } from "@pontis/quote-engine";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { compareRoutes } from "../src/quotes/compare.ts";
import { routeGuards } from "../src/quotes/guards.ts";
import { checkRefusal, explain, guardRefusal, refusalCode } from "../src/quotes/reasons.ts";
import { createQuote, type QuoteDeps } from "../src/quotes/service.ts";
import { AppError } from "../src/errors.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { unguarded } from "./helpers.ts";

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
const route = (refusal: string | null): ChainRouteView =>
  ({
    executable: refusal === null,
    refusal,
    terms: refusal === null ? terms : null,
    next_freeze_ms: null,
  }) as ChainRouteView;
const line = (name: string, passed: boolean, detail: string) => ({ name, passed, detail });
const guards = (checks: ReturnType<typeof line>[]): ChainRouteGuards => ({
  executable: checks.every((c) => c.passed),
  checks,
  fee_bps: 10,
  skew_bps: 0,
  degraded: false,
});
const chain = (over: Partial<QuoteChain> = {}): QuoteChain => ({
  ...unguarded({
    getRoute: async () => route(null),
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
const refusedWith = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    if (error instanceof AppError)
      return { code: error.code, status: error.status, message: error.message };
  }
  return undefined;
};

describe("route refusals", () => {
  it.each([
    ["reserve_restricted", "RESERVE_RESTRICTED"],
    ["reserve_stale", "RESERVE_STALE"],
  ] as const)("maps %s to %s with a plain explanation", (refusal, code) => {
    expect(refusalCode(refusal)).toBe(code);
    expect(explain(refusal)).toMatch(/reserve/i);
    expect(explain(refusal)).toMatch(/simulated/i);
    expect(explain(refusal)).not.toMatch(/fully backed|audited by|verified reserves/i);
  });

  it.each([
    ["reserve_restricted", "RESERVE_RESTRICTED"],
    ["reserve_stale", "RESERVE_STALE"],
  ])("refuses a quote when the route says %s", async (refusal, code) => {
    const got = await refusedWith(createQuote(deps({ getRoute: async () => route(refusal) }), req));
    expect(got).toMatchObject({ code, status: 422 });
    expect(got?.message).toMatch(/reserve/i);
  });

  it("compares a route closed for reserves with the same reason code", async () => {
    const res = await compareRoutes(t.db, chain({ getRoute: async () => route("reserve_stale") }), {
      fromId: "tgold-a",
      toId: "tgold-b",
    });
    expect(res.routes[0]).toMatchObject({ executable: false, reasonCode: "RESERVE_STALE" });
  });
});

describe("the reserves line of get_route_guards", () => {
  it.each([
    ["tgold-a: breached, ratio 5000", "RESERVE_RESTRICTED"],
    ["tgold-b: stale, ratio 10000", "RESERVE_STALE"],
    ["tgold-a: no_attestation, ratio none", "RESERVE_STALE"],
  ])("maps a failed line %j to %s", (detail, code) => {
    expect(checkRefusal(line("reserves", false, detail))).toBe(code);
  });

  it("a passing line has no reason, and the route line's variant name maps too", () => {
    expect(checkRefusal(line("reserves", true, "tgold-a: ok, ratio 12500"))).toBeUndefined();
    expect(checkRefusal(line("route", false, "ReserveRestricted"))).toBe("RESERVE_RESTRICTED");
    expect(checkRefusal(line("route", false, "ReserveStale"))).toBe("RESERVE_STALE");
  });

  it("refuses a quote on a failed reserves line and says why in words", async () => {
    const view = guards([
      line("route", true, "executable"),
      line("reserves", false, "tgold-b: breached, ratio 5000"),
    ]);
    expect(guardRefusal(view.checks)).toMatchObject({ code: "RESERVE_RESTRICTED" });
    const got = await refusedWith(createQuote(deps({ getRouteGuards: async () => view }), req));
    expect(got).toMatchObject({ code: "RESERVE_RESTRICTED", status: 422 });
    expect(got?.message).toMatch(/simulated/i);
  });

  it("a stale reserve refuses with RESERVE_STALE on a quote and on comparison", async () => {
    const view = guards([
      line("route", true, "executable"),
      line("reserves", false, "tgold-a: stale, ratio 10000"),
    ]);
    expect(
      (await refusedWith(createQuote(deps({ getRouteGuards: async () => view }), req)))?.code,
    ).toBe("RESERVE_STALE");
    const res = await compareRoutes(t.db, chain({ getRouteGuards: async () => view }), {
      fromId: "tgold-a",
      toId: "tgold-b",
      amount: "1000000",
    });
    expect(res.routes[0]).toMatchObject({ executable: false, reasonCode: "RESERVE_STALE" });
  });

  it("the breakdown endpoint carries the reason code on the failed reserves check", async () => {
    const view = guards([
      line("route", true, "executable"),
      line("reserves", false, "tgold-a: stale, ratio 10000"),
      line("reserves", true, "tgold-b: ok, ratio 12500"),
    ]);
    const body = await routeGuards(
      t.db,
      chain({ getRouteGuards: async () => view }),
      "tgold-a",
      "tgold-b",
      undefined,
      NOW,
    );
    expect(body.executable).toBe(false);
    expect(body.checks.filter((c) => c.name === "reserves")).toEqual([
      {
        name: "reserves",
        passed: false,
        detail: "tgold-a: stale, ratio 10000",
        reasonCode: "RESERVE_STALE",
      },
      { name: "reserves", passed: true, detail: "tgold-b: ok, ratio 12500" },
    ]);
  });
});
