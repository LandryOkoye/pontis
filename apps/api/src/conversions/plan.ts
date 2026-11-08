// The unsigned plan the wallet signs for a conversion (BuildPlan B11). The backend never signs for
// users: it only assembles the actions. Each action targets one receiver, so a wallet sends the
// storage deposit (if any) and the `ft_transfer_call` as separate transactions, in this order.

import type { WalletAction } from "@pontis/api-types";
import { conversionMsg, ftTransferCallAction, storageDepositAction } from "@pontis/near-client";
import { QUOTE_VERSION, toChainQuote } from "@pontis/quote-engine";
import type { QuoteRow } from "../quotes/quote-mapper.ts";

export interface PlanInput {
  quote: QuoteRow;
  /** Token contract accounts of the quote's source and destination representations. */
  tokenIn: string;
  tokenOut: string;
  coreId: string;
  /** False when the user must be registered on the destination token before it can be paid out. */
  userRegisteredOnTokenOut: boolean;
}

export function buildWalletPlan(input: PlanInput): WalletAction[] {
  const { quote: q } = input;
  const chainQuote = toChainQuote({
    version: QUOTE_VERSION,
    contract: input.coreId,
    user: q.accountId,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: BigInt(q.amountIn),
    amountOutGross: BigInt(q.amountOutGross),
    fee: BigInt(q.fee),
    amountOut: BigInt(q.amountOut),
    feeBps: q.feeBps,
    expiresAtMs: q.expiresAt.getTime(),
    nonce: q.nonce,
    compatibilityVersion: q.compatibilityVersion,
    policyVersion: q.policyVersion,
  });
  const transfer = ftTransferCallAction({
    tokenId: input.tokenIn,
    receiverId: input.coreId,
    amount: q.amountIn,
    msg: conversionMsg(chainQuote, q.signature),
  });
  return input.userRegisteredOnTokenOut
    ? [transfer]
    : [storageDepositAction({ tokenId: input.tokenOut, accountId: q.accountId }), transfer];
}
