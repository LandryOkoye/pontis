import { keyFromSeed } from "@pontis/quote-engine";
import type { AppDeps } from "../src/app.ts";
import type { Db } from "@pontis/db";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { AppError } from "../src/errors.ts";
import type { AuthChain, KeyType } from "../src/auth/types.ts";

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

/**
 * A chain for sign-in tests: `keys` maps account to public key to key type; `roles` maps account to
 * role names and may be changed between calls. `reads` counts role reads per account.
 */
export function fakeAuthChain(
  keys: Record<string, Record<string, KeyType>> = {},
  roles: Record<string, string[]> = {},
) {
  const reads: Record<string, number> = {};
  const chain: AuthChain = {
    getAccessKey: async (account, publicKey) => {
      const type = keys[account]?.[publicKey];
      return type ? { type } : null;
    },
    getAccountRoles: async (account) => {
      reads[account] = (reads[account] ?? 0) + 1;
      return roles[account] ?? [];
    },
  };
  return { chain, keys, roles, reads };
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
    actionsChain: {
      getCorporateActions: async () => [],
      getMultiplierEpochs: async () => [],
      getLifecycle: async () => null,
      getNavStrike: async () => null,
    },
    conversionChain: { isRegistered: async () => true },
    txVerifier: { getTransaction: async () => undefined },
    auth: { chain: fakeAuthChain().chain, recipient: "pontis-api.test", networkId: "sandbox" },
    ...over,
  };
}
