import { verify } from "node:crypto";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRouteView } from "@pontis/near-client";
import { keyFromSeed, quoteMessage } from "@pontis/quote-engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quotes } from "../src/db/schema/index.ts";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { expireQuotes, getQuote } from "../src/quotes/lifecycle.ts";
import { QUOTE_TTL_MS, createQuote, type QuoteDeps } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "./db.ts";
import { errorCodeOf } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const key = keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const NOW = new Date("2026-11-07T18:00:00Z");
const terms = { ratio: { num: "1000", den: "1" }, compatibility_version: 2, policy_version: 1 };
const ok: ChainRouteView = { executable: true, refusal: null, terms };
const chain = (over: Partial<QuoteChain> = {}): QuoteChain => ({
  getRoute: async () => ok,
  isAllowed: async () => true,
  getInventory: async () => "1000000000000",
  getFeeBps: async () => 10,
  ...over,
});
const deps = (over: Partial<QuoteChain> = {}): QuoteDeps => ({
  db: t.db,
  chain: chain(over),
  key,
  coreId: "core.testnet",
  now: () => NOW,
});
const req = { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: "alice.testnet" };

describe("createQuote", () => {
  it("computes the contract amounts, binds versions, expires in 60 s and persists a verifiable signature", async () => {
    const q = await createQuote(deps(), req);
    expect([q.amountOutGross, q.fee, q.amountOut]).toEqual(["1000000000", "1000000", "999000000"]);
    expect(q).toMatchObject({
      state: "QUOTED",
      feeBps: 10,
      compatibilityVersion: 2,
      policyVersion: 1,
      ratio: { num: "1000", den: "1" },
    });
    expect(new Date(q.expiresAt).getTime() - NOW.getTime()).toBe(QUOTE_TTL_MS);
    expect(q.warnings.map((w) => w.code)).toEqual(["SYNTHETIC", "NETWORK_COST"]);

    const [row] = await t.db.select().from(quotes).where(eq(quotes.id, q.id));
    const message = quoteMessage({
      version: 1,
      contract: "core.testnet",
      user: "alice.testnet",
      tokenIn: "tgold-a.pontis.testnet",
      tokenOut: "tgold-b.pontis.testnet",
      amountIn: 1_000_000n,
      amountOutGross: 1_000_000_000n,
      fee: 1_000_000n,
      amountOut: 999_000_000n,
      feeBps: 10,
      expiresAtMs: NOW.getTime() + QUOTE_TTL_MS,
      nonce: row?.nonce ?? "",
      compatibilityVersion: 2,
      policyVersion: 1,
    });
    expect(verify(null, message, key.privateKey, Buffer.from(row?.signature ?? "", "base64"))).toBe(
      true,
    );
    expect(row?.nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uses the fee the chain reports and a fresh nonce each time", async () => {
    const [a, b] = [
      await createQuote(deps({ getFeeBps: async () => 0 }), req),
      await createQuote(deps(), req),
    ];
    expect([a.fee, a.amountOut]).toEqual(["0", "1000000000"]);
    const rows = await t.db.select().from(quotes);
    expect(new Set(rows.map((r) => r.nonce)).size).toBe(rows.length);
    expect(a.id).not.toBe(b.id);
  });

  it.each([
    [
      "a suspended relationship",
      {
        getRoute: async () =>
          ({ executable: false, refusal: "relationship_suspended", terms: null }) as ChainRouteView,
      },
      "RELATIONSHIP_SUSPENDED",
    ],
    [
      "a paused asset",
      {
        getRoute: async () =>
          ({ executable: false, refusal: "asset_paused", terms: null }) as ChainRouteView,
      },
      "ASSET_PAUSED",
    ],
    [
      "a non-parity pair",
      {
        getRoute: async () =>
          ({ executable: false, refusal: "not_direct_equivalent", terms: null }) as ChainRouteView,
      },
      "NOT_DIRECT_EQUIVALENT",
    ],
    [
      "an account off the allowlist",
      { isAllowed: async (id: string) => id !== "tgold-b" },
      "NOT_ELIGIBLE",
    ],
    ["an empty vault", { getInventory: async () => "998999999" }, "INSUFFICIENT_INVENTORY"],
  ])("refuses %s with %s", async (_name, over, code) => {
    expect(await errorCodeOf(createQuote(deps(over), req))).toBe(code);
  });

  it("rejects zero, dust and unknown assets before signing anything", async () => {
    const before = (await t.db.select().from(quotes)).length;
    expect(await errorCodeOf(createQuote(deps(), { ...req, amountIn: "0" }))).toBe(
      "VALIDATION_ERROR",
    );
    const dust = { ...req, fromId: "tgold-b", toId: "tgold-a", amountIn: "999" };
    expect(
      await errorCodeOf(
        createQuote(
          deps({
            getRoute: async () => ({
              ...ok,
              terms: { ...terms, ratio: { num: "1", den: "1000" } },
            }),
          }),
          dust,
        ),
      ),
    ).toBe("VALIDATION_ERROR");
    expect(await errorCodeOf(createQuote(deps(), { ...req, toId: "ghost" }))).toBe("NOT_FOUND");
    expect((await t.db.select().from(quotes)).length).toBe(before);
  });
});

describe("quote expiry", () => {
  it("reads a quote back and expires it lazily once past its expiry", async () => {
    const q = await createQuote(deps(), req);
    expect((await getQuote(t.db, q.id, NOW))?.state).toBe("QUOTED");
    const later = new Date(NOW.getTime() + QUOTE_TTL_MS);
    expect((await getQuote(t.db, q.id, later))?.state).toBe("EXPIRED");
    expect(await getQuote(t.db, "00000000-0000-4000-8000-000000000000", NOW)).toBeUndefined();
  });

  it("the sweep expires QUOTED and ACCEPTED quotes and leaves terminal ones alone", async () => {
    const [a, b, c] = [
      await createQuote(deps(), req),
      await createQuote(deps(), req),
      await createQuote(deps(), req),
    ];
    await t.db.update(quotes).set({ state: "ACCEPTED" }).where(eq(quotes.id, b.id));
    await t.db.update(quotes).set({ state: "SETTLED" }).where(eq(quotes.id, c.id));
    await expireQuotes(t.db, new Date(NOW.getTime() + 10 * QUOTE_TTL_MS));
    const state = async (id: string) =>
      (await t.db.select().from(quotes).where(eq(quotes.id, id)))[0]?.state;
    expect([await state(a.id), await state(b.id), await state(c.id)]).toEqual([
      "EXPIRED",
      "EXPIRED",
      "SETTLED",
    ]);
  });
});
