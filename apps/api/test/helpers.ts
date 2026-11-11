import { keyFromSeed } from "@pontis/quote-engine";
import type { AppDeps } from "../src/app.ts";
import type { Db } from "@pontis/db";
import type { QuoteChain } from "../src/quotes/chain.ts";
import { AppError } from "../src/errors.ts";
import type { CustodyRepository } from "../src/custody/chain.ts";

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
    actionsChain: {
      getCorporateActions: async () => [],
      getMultiplierEpochs: async () => [],
      getLifecycle: async () => null,
      getNavStrike: async () => null,
    },
    custodyChain: emptyCustodyChain(),
    conversionChain: { isRegistered: async () => true },
    txVerifier: { getTransaction: async () => undefined },
    ...over,
  };
}

/** A custody repository that knows nothing: no custodians, no link, an unmonitored asset. */
export function emptyCustodyChain(): CustodyRepository {
  const none = { items: [], total: 0 };
  return {
    getCustodians: async () => none,
    getCustodian: async () => null,
    getCustodyLink: async () => null,
    getReserveStatus: async () => ({
      monitored: false,
      state: "unmonitored",
      action: null,
      tolerance_bps: 0,
      max_reserve_age_ms: 0,
      attested_units: "0",
      limit_units: "0",
      circulating_units: "0",
      headroom_units: "0",
      ratio_bps: null,
      oldest_as_of_ms: null,
      age_ms: null,
      supply_read_ms: null,
      restricts_conversions: false,
      mint_paused: false,
      simulated: true,
      sources: [],
    }),
    getReserveAttestations: async () => [],
    getReserveHistory: async () => none,
    getRedemptionTerms: async () => null,
    getRedemption: async () => null,
    getRedemptionsByUser: async () => none,
    getRedemptionsByRepresentation: async () => none,
    getIssuerReliability: async (issuerId) => ({
      issuer_id: issuerId,
      requested: 0,
      accepted: 0,
      fulfilled: 0,
      rejected: 0,
      expired: 0,
      accept_misses: 0,
      fulfil_misses: 0,
      reclaimed: 0,
      accept_latency_ms_total: "0",
      settle_latency_ms_total: "0",
      last_miss_ms: null,
      simulated: true,
    }),
  };
}
