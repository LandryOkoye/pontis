import { z } from "zod";
import { AmountString } from "./common.ts";

export const EvmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .meta({ id: "EvmAddress" });
export const LendingProviderSchema = z
  .enum(["morpho-blue", "rhea"])
  .meta({ id: "LendingProvider" });
export const LendingChainSchema = z
  .enum(["ethereum-sepolia", "near-testnet"])
  .meta({ id: "LendingChain" });

export const CollateralAssetSchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    underlyingReference: z.string(),
    chain: LendingChainSchema,
    tokenStandard: z.enum(["ERC-20", "NEP-141"]),
    token: z.string(),
    decimals: z.number().int().min(0).max(255),
    origin: z.enum(["pontis", "rhea"]),
    verified: z.boolean(),
    issuer: z.object({ id: z.string(), name: z.string(), authorized: z.boolean() }),
  })
  .meta({ id: "CollateralAsset" });

export const LendingMarketSchema = z
  .object({
    id: z.string(),
    provider: LendingProviderSchema,
    chain: LendingChainSchema,
    collateralAssetId: z.string(),
    collateralToken: z.string(),
    loanToken: z.string(),
    loanSymbol: z.string(),
    lltvWad: AmountString,
    availableLiquidity: AmountString,
    enabled: z.boolean(),
  })
  .meta({ id: "LendingMarket" });

export const EligibilitySchema = z
  .object({
    eligible: z.boolean(),
    reasons: z.array(
      z.enum([
        "UNKNOWN_ASSET",
        "UNVERIFIED_TOKEN",
        "UNAUTHORIZED_ISSUER",
        "POLICY_DISABLED",
        "UNSUPPORTED_CHAIN",
        "UNSUPPORTED_PROVIDER",
        "MISSING_PRICE",
        "STALE_PRICE",
        "LOW_CONFIDENCE_PRICE",
      ]),
    ),
    asset: CollateralAssetSchema.nullable(),
    priceObservedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "CollateralEligibility" });

export const BorrowingCapacitySchema = z
  .object({
    collateralValue: AmountString,
    maximumBorrowCapacity: AmountString,
    availableBorrowAmount: AmountString,
    outstandingDebt: AmountString,
    currentLtvWad: AmountString,
    liquidationThresholdWad: AmountString,
    healthFactorWad: AmountString.nullable(),
    marketLiquidity: AmountString,
  })
  .meta({ id: "BorrowingCapacity" });

export const WalletTransactionSchema = z
  .object({
    chain: LendingChainSchema,
    to: z.string(),
    data: z.string().regex(/^0x[0-9a-fA-F]*$/),
    value: AmountString,
    description: z.string(),
  })
  .meta({ id: "LendingWalletTransaction" });

/** EVM and NEAR providers have different account formats; this discovery input is provider-neutral. */
export const ListWalletAssetsQuerySchema = z.object({ owner: z.string().min(2).max(128) });
export const EligibilityRequestSchema = z.strictObject({
  assetId: z.string(),
  provider: LendingProviderSchema,
  chain: LendingChainSchema,
  loanToken: z.string(),
});
export const CapacityQuerySchema = z.object({ owner: EvmAddress });
export const PlanLendingRequestSchema = z.strictObject({
  owner: EvmAddress,
  marketId: z.string(),
  amount: AmountString,
});
export const LendingPlanSchema = z
  .object({
    provider: LendingProviderSchema,
    marketId: z.string(),
    transactions: z.array(WalletTransactionSchema).min(1),
  })
  .meta({ id: "LendingPlan" });

export type LendingMarket = z.infer<typeof LendingMarketSchema>;
export type BorrowingCapacity = z.infer<typeof BorrowingCapacitySchema>;
