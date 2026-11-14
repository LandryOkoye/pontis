// Lending wire shapes, derived from the endpoint definitions in `@pontis/api-types` so they
// cannot drift from the API. Type-only: none of the Zod runtime reaches the bundle.
import type { ENDPOINTS } from "@pontis/api-types";

type Answer<K extends keyof typeof ENDPOINTS> = ReturnType<
  (typeof ENDPOINTS)[K]["response"]["parse"]
>;

export type CollateralAsset = Answer<"listCollateralAssets">["items"][number];
export type WalletCollateral = Answer<"listEligibleWalletAssets">["items"][number];
export type LendingMarket = Answer<"listLendingMarkets">["items"][number];
export type Eligibility = Answer<"checkCollateralEligibility">;
export type EligibilityReason = Eligibility["reasons"][number];
export type BorrowingCapacity = Answer<"getBorrowingCapacity">;
export type LendingPlan = Answer<"planBorrow">;
export type LendingTx = LendingPlan["transactions"][number];

export type LendingOperation = "deposit" | "borrow" | "repay" | "withdraw";

export interface EligibilityRequest {
  assetId: string;
  provider: LendingMarket["provider"];
  chain: LendingMarket["chain"];
  loanToken: string;
}

export interface PlanRequest {
  owner: string;
  marketId: string;
  amount: string;
}
