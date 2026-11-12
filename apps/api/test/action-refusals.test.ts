// Corporate actions, lifecycle and NAV strikes in the API (ADR 0017, ADR 0018): each new refusal
// has its reason code, and a quote never outlives the next freeze.

import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteView } from "@pontis/near-client";
import { keyFromSeed } from "@pontis/quote-engine";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { checkRefusal } from "../src/quotes/reasons.ts";
import { createQuote, QUOTE_TTL_MS, type QuoteDeps } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { errorCodeOf, unguarded } from "./helpers.ts";

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
const route = (next: number | null): ChainRouteView => ({
  executable: true,
  refusal: null,
  terms,
  next_freeze_ms: next,
});
const deps = (view: ChainRouteView): QuoteDeps => ({
  db: t.db,
  chain: {
    ...unguarded({
      getRoute: async () => view,
      isAllowed: async () => true,
      getInventory: async () => "1000000000000",
      getFeeBps: async () => 10,
    }),
  } satisfies QuoteChain,
  key: keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1)),
  coreId: "core.testnet",
  now: () => NOW,
});
const req = { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: "alice.testnet" };

describe("refusals of corporate actions and lifecycle", () => {
  it.each([
    ["corporate_action_freeze", "CORPORATE_ACTION_FREEZE"],
    ["corporate_action_pending", "CORPORATE_ACTION_PENDING"],
    ["epoch_mismatch", "EPOCH_MISMATCH"],
    ["not_convertible", "NOT_CONVERTIBLE"],
    ["lifecycle_blocked", "LIFECYCLE_BLOCKED"],
    ["nav_window_closed", "NAV_WINDOW_CLOSED"],
  ])("refuses a quote when the route says %s with %s", async (refusal, code) => {
    const closed = { executable: false, refusal, terms: null, next_freeze_ms: null };
    expect(await errorCodeOf(createQuote(deps(closed as ChainRouteView), req))).toBe(code);
  });

  it.each([
    ["corporate_action_freeze", "tgold-a: freeze", "CORPORATE_ACTION_FREEZE"],
    ["corporate_action_pending", "syn-gold-oz-1", "CORPORATE_ACTION_PENDING"],
    ["epoch_mismatch", "live multiplier quotient differs", "EPOCH_MISMATCH"],
    ["not_convertible", "tgold-a: no_conversion=true bridge_only=false", "NOT_CONVERTIBLE"],
    ["lifecycle_blocked", "tgold-a: stage Delisted", "LIFECYCLE_BLOCKED"],
    ["nav_window_closed", "tnav-a: None", "NAV_WINDOW_CLOSED"],
  ])("maps a failed %s line of the breakdown to %s", (name, detail, code) => {
    expect(checkRefusal({ name, passed: false, detail })).toBe(code);
    expect(checkRefusal({ name, passed: true, detail })).toBeUndefined();
  });

  it("maps the route line's variant name, as the contract prints it", () => {
    expect(checkRefusal({ name: "route", passed: false, detail: "CorporateActionFreeze" })).toBe(
      "CORPORATE_ACTION_FREEZE",
    );
    expect(checkRefusal({ name: "route", passed: false, detail: "NavWindowClosed" })).toBe(
      "NAV_WINDOW_CLOSED",
    );
  });
});

describe("quote expiry and the next freeze", () => {
  const expiry = async (next: number | null) =>
    (await createQuote(deps(route(next)), req)).expiresAt;

  it("expires at the freeze when it comes before the usual lifetime", async () => {
    expect(await expiry(NOW.getTime() + 20_000)).toBe("2026-11-07T18:00:20.000Z");
  });

  it("keeps the usual lifetime when the freeze is later, absent or already past", async () => {
    const usual = new Date(NOW.getTime() + QUOTE_TTL_MS).toISOString();
    expect(await expiry(NOW.getTime() + QUOTE_TTL_MS + 1)).toBe(usual);
    expect(await expiry(null)).toBe(usual);
    expect(await expiry(NOW.getTime() - 1)).toBe(usual);
    expect(await expiry(NOW.getTime())).toBe(usual);
  });
});
