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

/** Enough for any call below: a token call, its callback, and the core's own work. Unused gas is refunded. */
export const CORE_CALL_GAS = 80n * TGAS;

const HASH64 = /^[0-9a-f]{64}$/;

/**
 * The `ft_transfer_call` message that requests a redemption (ADR 0020 section 7, as built):
 * `redeem:{terms_hash}:{payout_instruction_hash}`, both exactly 64 lowercase hex characters,
 * which is what `pontis-core`'s `parse_msg` accepts. Anything else is refused `INVALID_MSG` on
 * chain and the escrow comes back, so a bad hash is rejected here instead.
 */
export function redeemMsg(termsHash: string, payoutInstructionHash: string): string {
  if (!HASH64.test(termsHash)) throw new Error("terms hash must be 64 lowercase hex characters");
  if (!HASH64.test(payoutInstructionHash))
    throw new Error("payout instruction hash must be 64 lowercase hex characters");
  return `redeem:${termsHash}:${payoutInstructionHash}`;
}

const coreCall = (
  coreId: string,
  methodName: string,
  args: Record<string, unknown>,
): FunctionCallAction => ({
  receiverId: coreId,
  methodName,
  args,
  gas: CORE_CALL_GAS.toString(),
  deposit: ONE_YOCTO,
});

/** The redeemer's exit: after a rejection or an expiry (or a missed deadline) the escrow returns. */
export const reclaimRedemptionAction = (coreId: string, id: string) =>
  coreCall(coreId, "reclaim_redemption", { id: Number(id) });

export const acceptRedemptionAction = (coreId: string, id: string) =>
  coreCall(coreId, "accept_redemption", { id: Number(id) });

export const rejectRedemptionAction = (coreId: string, id: string, reason: string) =>
  coreCall(coreId, "reject_redemption", { id: Number(id), reason });

export const fulfilRedemptionAction = (coreId: string, id: string, evidenceHash: string) =>
  coreCall(coreId, "fulfil_redemption", { id: Number(id), evidence_hash: evidenceHash });

export const requestMintAction = (
  coreId: string,
  p: { representationId: string; recipient: string; amount: string; reference: string },
) =>
  coreCall(coreId, "request_mint", {
    representation_id: p.representationId,
    recipient: p.recipient,
    amount: p.amount,
    reference: p.reference,
  });

export const executeMintAction = (coreId: string, requestId: string) =>
  coreCall(coreId, "execute_mint", { request_id: Number(requestId) });
