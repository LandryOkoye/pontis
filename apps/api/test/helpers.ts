import { keyFromSeed } from "@pontis/quote-engine";
import type { AppDeps } from "../src/app.ts";
import type { Db } from "@pontis/db";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { AppError } from "../src/errors.ts";

/** The `code` of the AppError a promise rejects with, or undefined if it resolves or throws another error. */
export async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : undefined;
  }
  return undefined;
}

/** A chain with no guard on any pair: the MVP behaviour. The guard view mirrors what the contract returns then. */
export function unguarded(base: Omit<QuoteChain, "getRouteGuards" | "getPrice">): QuoteChain {
  return {
    ...base,
    getRouteGuards: async (_from, _to, amountIn) => ({
      executable: true,
      checks: [
        { name: "route", passed: true, detail: "executable" },
        { name: "guard", passed: false, detail: "unguarded" },
      ],
      fee_bps: amountIn === undefined ? null : await base.getFeeBps(),
      skew_bps: amountIn === undefined ? null : 0,
      degraded: false,
    }),
    getPrice: async () => null,
  };
}

/** App dependencies with a fake chain that approves the MVP pair: tests override what they probe. */
export function testAppDeps(db: Db, over: Partial<AppDeps> = {}): AppDeps {
  const chain: QuoteChain = unguarded({
    getRoute: async () => ({
      executable: true,
      refusal: null,
      next_freeze_ms: null,
      terms: { ratio: { num: "1000", den: "1" }, compatibility_version: 2, policy_version: 1 },
    }),
    isAllowed: async () => true,
    getInventory: async () => "1000000000000",
    getFeeBps: async () => 10,
  });
  const key = keyFromSeed(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
  return {
    db,
    chainHeight: async () => 1,
    quotes: { chain, key, coreId: "core.testnet" },
    conversionChain: { isRegistered: async () => true },
    txVerifier: { getTransaction: async () => undefined },
    ...over,
  };
}
