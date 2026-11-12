/**
 * Lending is deliberately provider-neutral.  These types are the seam between
 * Pontis' eligibility/risk decisions and a lending venue's contract adapter.
 * Amounts are integer token units; prices are loan-token units per collateral
 * token unit, expressed as a rational to avoid floating point risk decisions.
 */

export type LendingProviderId = "morpho-blue" | "rhea";
export type SupportedChain = "ethereum-sepolia" | "near-testnet";

export interface AssetIssuer {
  readonly id: string;
  readonly name: string;
  readonly authorized: boolean;
}

export interface CollateralAsset {
  readonly id: string;
  readonly issuer: AssetIssuer;
  readonly symbol: string;
  readonly underlyingReference: string;
  readonly chain: SupportedChain;
  readonly tokenStandard: "ERC-20" | "NEP-141";
  /** Checksummed EVM contract address or NEAR token account, supplied by the registry. */
  readonly token: string;
  readonly decimals: number;
  /** A Rhea-discovered asset remains NEAR-only unless a separate EVM representation is registered. */
  readonly origin: "pontis" | "rhea";
  readonly verified: boolean;
}

export interface CollateralPolicy {
  readonly assetId: string;
  readonly enabled: boolean;
  /** WAD percentage: 0.5e18 is 50%. This is Pontis' cap, not a market parameter. */
  readonly maxLtvWad: bigint;
  readonly maxOracleAgeSeconds: number;
  readonly minimumValuationConfidenceBps: number;
  readonly allowedProviders: readonly LendingProviderId[];
  readonly allowedChains: readonly SupportedChain[];
  readonly restrictions: readonly string[];
}

export interface OraclePrice {
  readonly assetId: string;
  readonly loanToken: string;
  /** loan-token smallest units / collateral-token smallest unit */
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly observedAt: Date;
  readonly confidenceBps: number;
  readonly verified: boolean;
}

export type EligibilityReason =
  | "UNKNOWN_ASSET"
  | "UNVERIFIED_TOKEN"
  | "UNAUTHORIZED_ISSUER"
  | "POLICY_DISABLED"
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_PROVIDER"
  | "MISSING_PRICE"
  | "STALE_PRICE"
  | "LOW_CONFIDENCE_PRICE";

export interface CollateralEligibility {
  readonly eligible: boolean;
  readonly reasons: readonly EligibilityReason[];
  readonly asset: CollateralAsset | null;
  readonly policy: CollateralPolicy | null;
  readonly price: OraclePrice | null;
}

export interface LendingMarket {
  readonly id: string;
  readonly provider: LendingProviderId;
  readonly chain: SupportedChain;
  readonly collateralAssetId: string;
  readonly collateralToken: string;
  readonly loanToken: string;
  readonly loanSymbol: "USDC" | "USDT" | string;
  /** Morpho LLTV / provider liquidation threshold, scaled by WAD. */
  readonly lltvWad: bigint;
  readonly availableLiquidity: bigint;
  readonly enabled: boolean;
}

export interface WalletAsset {
  readonly assetId: string;
  readonly token: string;
  readonly balance: bigint;
}

export interface CollateralPosition {
  readonly marketId: string;
  readonly owner: string;
  readonly collateral: bigint;
}

export interface BorrowPosition {
  readonly marketId: string;
  readonly owner: string;
  readonly debt: bigint;
}

export interface LendingPosition extends CollateralPosition, BorrowPosition {
  readonly provider: LendingProviderId;
}

export interface BorrowingCapacity {
  readonly collateralValue: bigint;
  readonly maximumBorrowCapacity: bigint;
  readonly availableBorrowAmount: bigint;
  readonly outstandingDebt: bigint;
  /** WAD ratio: debt/collateralValue. */
  readonly currentLtvWad: bigint;
  readonly liquidationThresholdWad: bigint;
  /** WAD ratio: liquidation threshold/current LTV; null with no debt. */
  readonly healthFactorWad: bigint | null;
  readonly marketLiquidity: bigint;
}

/** A wallet-signed call. Pontis does not accept private keys or broadcast this itself. */
export interface WalletTransaction {
  readonly chain: SupportedChain;
  readonly to: string;
  readonly data: string;
  readonly value: bigint;
  readonly description: string;
}

export type LendingOperation = "deposit" | "borrow" | "repay" | "withdraw";

export interface LendingTransaction {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly operation: LendingOperation;
  readonly provider: LendingProviderId;
  readonly owner: string;
  readonly marketId: string;
  readonly status: "planned" | "submitted" | "confirmed" | "failed" | "reverted";
  readonly transactions: readonly WalletTransaction[];
  readonly txHash: string | null;
}

export interface LendingProvider {
  readonly id: LendingProviderId;
  discoverWalletAssets(owner: string): Promise<readonly WalletAsset[]>;
  listMarkets(): Promise<readonly LendingMarket[]>;
  getPosition(marketId: string, owner: string): Promise<LendingPosition>;
  buildDeposit(
    marketId: string,
    owner: string,
    collateral: bigint,
  ): Promise<readonly WalletTransaction[]>;
  buildBorrow(
    marketId: string,
    owner: string,
    assets: bigint,
  ): Promise<readonly WalletTransaction[]>;
  buildRepay(
    marketId: string,
    owner: string,
    assets: bigint,
  ): Promise<readonly WalletTransaction[]>;
  buildWithdraw(
    marketId: string,
    owner: string,
    collateral: bigint,
  ): Promise<readonly WalletTransaction[]>;
}
