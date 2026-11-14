// Lending: query hooks, WAD display math and the copy for chains, venues and refusals.
// Risk decisions stay on the API; the math here only formats and previews.
import { formatDecimalAmount } from "@pontis/domain";
import { useQueries, useQuery } from "@tanstack/react-query";
import { evmAdapter } from "../evm/wallet.tsx";
import { ApiFailure, api } from "./api.ts";
import type { Tone } from "./copy.ts";
import { bpsText } from "./format.ts";
import type {
  BorrowingCapacity,
  EligibilityReason,
  LendingMarket,
  LendingOperation,
} from "./lending-types.ts";

export const WAD = 10n ** 18n;

export const CHAIN_LABEL: Record<LendingMarket["chain"], string> = {
  "ethereum-sepolia": "Ethereum Sepolia",
  "near-testnet": "NEAR Testnet",
};
export const PROVIDER_LABEL: Record<LendingMarket["provider"], string> = {
  "morpho-blue": "Morpho Blue",
  rhea: "Rhea",
};

export const REASON: Record<EligibilityReason, { label: string; meaning: string }> = {
  UNKNOWN_ASSET: {
    label: "Not registered",
    meaning: "The token is not in the Pontis collateral registry, or has no collateral policy.",
  },
  UNVERIFIED_TOKEN: {
    label: "Token not verified",
    meaning: "The token contract has not been verified in the collateral registry.",
  },
  UNAUTHORIZED_ISSUER: {
    label: "Issuer not authorised",
    meaning: "The registry does not record this issuer as authorised for the token.",
  },
  POLICY_DISABLED: {
    label: "Policy disabled",
    meaning: "The Pontis collateral policy for this token is switched off.",
  },
  UNSUPPORTED_CHAIN: {
    label: "Chain not allowed",
    meaning: "The policy does not allow this token as collateral on this chain.",
  },
  UNSUPPORTED_PROVIDER: {
    label: "Venue not allowed",
    meaning: "The policy does not allow this token as collateral on this lending venue.",
  },
  MISSING_PRICE: {
    label: "No verified price",
    meaning: "There is no verified oracle price for this collateral and loan token.",
  },
  STALE_PRICE: {
    label: "Stale price",
    meaning: "The latest oracle price is older than the policy allows.",
  },
  LOW_CONFIDENCE_PRICE: {
    label: "Low-confidence price",
    meaning: "The oracle's confidence in the price is below the policy minimum.",
  },
};

export const OPERATION: Record<
  LendingOperation,
  { label: string; verb: string; done: string; asset: "collateral" | "loan" }
> = {
  deposit: {
    label: "Deposit",
    verb: "Deposit collateral",
    done: "Collateral deposited",
    asset: "collateral",
  },
  borrow: { label: "Borrow", verb: "Borrow", done: "Borrow confirmed", asset: "loan" },
  repay: { label: "Repay", verb: "Repay debt", done: "Repayment confirmed", asset: "loan" },
  withdraw: {
    label: "Withdraw",
    verb: "Withdraw collateral",
    done: "Collateral withdrawn",
    asset: "collateral",
  },
};

/** A WAD ratio as a percentage with two decimals: 0.5e18 -> "50.00%". */
export const wadPercent = (wad: string | bigint): string =>
  bpsText(Number((BigInt(wad) * 10_000n) / WAD));

/** A WAD health factor, floored to two decimals: 1.789e18 -> "1.78". */
export const healthText = (wad: string | bigint): string =>
  formatDecimalAmount((BigInt(wad) * 100n) / WAD, 2);

/** Below 1 the position can be liquidated on the venue. */
export function healthTone(wad: string | bigint | null): Tone {
  if (wad === null) return "neutral";
  const value = BigInt(wad);
  if (value >= (WAD * 15n) / 10n) return "parity";
  return value >= (WAD * 11n) / 10n ? "warn" : "danger";
}

/**
 * The position after debt changes by `debtDelta` loan-token units (positive borrows, negative
 * repays), using the same integer formulas as the API. A preview only.
 */
export function projectDebt(capacity: BorrowingCapacity, debtDelta: bigint) {
  const value = BigInt(capacity.collateralValue);
  const lltv = BigInt(capacity.liquidationThresholdWad);
  const raw = BigInt(capacity.outstandingDebt) + debtDelta;
  const debt = raw > 0n ? raw : 0n;
  const ltvWad = value === 0n ? (debt === 0n ? 0n : WAD) : (debt * WAD) / value;
  return { debt, ltvWad, healthFactorWad: debt === 0n ? null : (value * lltv) / debt };
}

/** The API serves lending only when a verified deployment is configured. */
export const lendingUnavailable = (error: unknown): boolean =>
  error instanceof ApiFailure && (error.status === 404 || error.status === 501);

export const lendingKeys = {
  all: ["lending"] as const,
  assets: ["lending", "assets"] as const,
  markets: ["lending", "markets"] as const,
  walletAssets: (owner: string) => ["lending", "wallet-assets", owner] as const,
  eligibility: (marketId: string) => ["lending", "eligibility", marketId] as const,
  capacity: (marketId: string, owner: string) => ["lending", "capacity", marketId, owner] as const,
  decimals: (token: string) => ["lending", "decimals", token] as const,
  balance: (token: string, owner: string) => ["lending", "balance", token, owner] as const,
};

export const useCollateralAssets = () =>
  useQuery({ queryKey: lendingKeys.assets, queryFn: api.collateralAssets });

export const useLendingMarkets = () =>
  useQuery({ queryKey: lendingKeys.markets, queryFn: api.lendingMarkets, refetchInterval: 30_000 });

export const useWalletCollateral = (owner: string | null) =>
  useQuery({
    queryKey: lendingKeys.walletAssets(owner ?? ""),
    queryFn: () => api.walletCollateral(owner as string),
    enabled: !!owner,
  });

const eligibilityQuery = (market: LendingMarket) => ({
  queryKey: lendingKeys.eligibility(market.id),
  queryFn: () =>
    api.collateralEligibility({
      assetId: market.collateralAssetId,
      provider: market.provider,
      chain: market.chain,
      loanToken: market.loanToken,
    }),
  // Eligibility depends on price age, so it goes stale on its own.
  refetchInterval: 30_000,
});

export const useEligibility = (market: LendingMarket | undefined) =>
  useQuery({
    queryKey: lendingKeys.eligibility(market?.id ?? ""),
    queryFn: () => eligibilityQuery(market as LendingMarket).queryFn(),
    enabled: !!market,
    refetchInterval: 30_000,
  });

export const useEligibilities = (markets: readonly LendingMarket[]) =>
  useQueries({ queries: markets.map(eligibilityQuery) });

export const useCapacity = (marketId: string | undefined, owner: string | null, enabled = true) =>
  useQuery({
    queryKey: lendingKeys.capacity(marketId ?? "", owner ?? ""),
    queryFn: () => api.borrowingCapacity(marketId as string, owner as string),
    enabled: !!marketId && !!owner && enabled,
    refetchInterval: 15_000,
  });

const decimalsQuery = (token: string) => ({
  queryKey: lendingKeys.decimals(token),
  queryFn: async () => (await evmAdapter()).decimals(token),
  staleTime: Infinity,
});

/** ERC-20 decimals read from the token contract; the market list does not carry them. */
export const useTokenDecimals = (token: string | undefined) =>
  useQuery({
    ...decimalsQuery(token ?? ""),
    enabled: !!token,
  });

export const useTokenDecimalsMany = (tokens: readonly string[]) =>
  useQueries({ queries: tokens.map(decimalsQuery) });

export const useTokenBalance = (token: string | undefined, owner: string | null) =>
  useQuery({
    queryKey: lendingKeys.balance(token ?? "", owner ?? ""),
    queryFn: async () => (await evmAdapter()).balanceOf(token as string, owner as string),
    enabled: !!token && !!owner,
    refetchInterval: 20_000,
  });
