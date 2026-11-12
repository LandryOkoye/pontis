import type {
  BorrowingCapacity,
  CollateralEligibility,
  LendingMarket,
  LendingPosition,
} from "./types.ts";

export const WAD = 10n ** 18n;

/** Integer-only risk math. Caller must first pass a fresh, eligible oracle result. */
export function calculateBorrowingCapacity(
  eligibility: CollateralEligibility,
  market: LendingMarket,
  position: LendingPosition,
): BorrowingCapacity {
  if (!eligibility.eligible || !eligibility.policy || !eligibility.price)
    throw new Error("Collateral is not eligible for lending");
  if (market.availableLiquidity < 0n || position.collateral < 0n || position.debt < 0n)
    throw new Error("Negative lending amounts are invalid");

  const price = eligibility.price;
  const collateralValue = (position.collateral * price.numerator) / price.denominator;
  const allowedLtv = min(market.lltvWad, eligibility.policy.maxLtvWad);
  const maximumBorrowCapacity = (collateralValue * allowedLtv) / WAD;
  const headroom =
    maximumBorrowCapacity > position.debt ? maximumBorrowCapacity - position.debt : 0n;
  const availableBorrowAmount = min(headroom, market.availableLiquidity);
  const currentLtvWad =
    collateralValue === 0n
      ? position.debt === 0n
        ? 0n
        : WAD
      : (position.debt * WAD) / collateralValue;
  const healthFactorWad =
    position.debt === 0n ? null : (collateralValue * market.lltvWad) / position.debt;
  return {
    collateralValue,
    maximumBorrowCapacity,
    availableBorrowAmount,
    outstandingDebt: position.debt,
    currentLtvWad,
    liquidationThresholdWad: market.lltvWad,
    healthFactorWad,
    marketLiquidity: market.availableLiquidity,
  };
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
