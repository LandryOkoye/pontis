// The one place that turns an input amount into what must be paid out and asks whether the vault
// can cover it. Route comparison and quote creation both call this, so they cannot disagree: the
// fee comes from the shared quote engine (the contract's math) and inventory is checked against
// the net payout, which is what `ft_transfer` actually sends.

import type { Amounts } from "@pontis/quote-engine";
import { computeAmounts } from "@pontis/quote-engine";
import { AppError } from "../errors.ts";
import type { QuoteChain } from "./chain.ts";

export interface RatioTerms {
  readonly num: string;
  readonly den: string;
}

/** Gross, fee and net for `amountIn`; a 400 when the amount overflows or its net output is zero. */
export function payoutAmounts(amountIn: bigint, ratio: RatioTerms, feeBps: number): Amounts {
  const amounts = computeAmounts(
    amountIn,
    { num: BigInt(ratio.num), den: BigInt(ratio.den) },
    feeBps,
  );
  if (!amounts) throw new AppError("VALIDATION_ERROR", 400, "amountIn is too large");
  if (amounts.net === 0n) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "amountIn is too small to convert to a non-zero output",
    );
  }
  return amounts;
}

/** Whether the vault's inventory of `toId` covers the net payout (exact inventory is enough). */
export async function vaultCovers(
  chain: QuoteChain,
  toId: string,
  amounts: Amounts,
): Promise<boolean> {
  return BigInt(await chain.getInventory(toId)) >= amounts.net;
}
