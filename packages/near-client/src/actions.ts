// Unsigned NEAR FunctionCall actions for the wallet to sign. The backend never signs for users:
// `POST /v1/conversions` returns these (BuildPlan B11). Amounts, gas and deposits are decimal strings.

export interface FunctionCallAction {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  /** Gas units. */
  gas: string;
  /** yoctoNEAR. */
  deposit: string;
}

const TGAS = 10n ** 12n;
/** A conversion completes with about 40 Tgas in the sandbox; 100 leaves wide headroom (B8). */
export const CONVERSION_GAS = 100n * TGAS;
const SMALL_CALL_GAS = 30n * TGAS;
const ONE_YOCTO = "1";
/** Attached to `storage_deposit` with `registration_only`; the token refunds the excess. */
export const STORAGE_DEPOSIT = (10n ** 22n).toString();

export function ftTransferCallAction(p: {
  tokenId: string;
  receiverId: string;
  amount: string;
  msg: string;
}): FunctionCallAction {
  return {
    receiverId: p.tokenId,
    methodName: "ft_transfer_call",
    args: { receiver_id: p.receiverId, amount: p.amount, msg: p.msg },
    gas: CONVERSION_GAS.toString(),
    deposit: ONE_YOCTO,
  };
}

/** Registers `accountId` on a token so it can receive it (a payout to an unregistered account fails). */
export function storageDepositAction(p: {
  tokenId: string;
  accountId: string;
}): FunctionCallAction {
  return {
    receiverId: p.tokenId,
    methodName: "storage_deposit",
    args: { account_id: p.accountId, registration_only: true },
    gas: SMALL_CALL_GAS.toString(),
    deposit: STORAGE_DEPOSIT,
  };
}

/** Testnet faucet: mints `amount` to the caller. The caller must already be registered. */
export function faucetMintAction(p: { tokenId: string; amount: string }): FunctionCallAction {
  return {
    receiverId: p.tokenId,
    methodName: "faucet_mint",
    args: { amount: p.amount },
    gas: SMALL_CALL_GAS.toString(),
    deposit: "0",
  };
}

/** The `ft_transfer_call` message of a conversion: the quote fields and the base64 signature. */
export function conversionMsg(quote: Record<string, unknown>, signatureBase64: string): string {
  return JSON.stringify({ quote, signature: signatureBase64 });
}
