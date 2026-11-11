// POST /v1/redemptions/prepare (ADR 0020 sections 7 and 10). The redeemer is the session's
// account. The terms, window and amount are checked here against what the chain stores, so the
// user hears "below minimum" before signing rather than getting the tokens back from a refused
// `ft_on_transfer`; the contract checks again, and its answer is the one that counts. The API
// stores the client-encrypted payout instruction unread and returns an unsigned `ft_transfer_call`.

import type { PrepareRedemptionRequest, PrepareRedemptionResponse } from "@pontis/api-types";
import { nextRedemptionWindowMs, redemptionFee, redemptionWindowOpen } from "@pontis/domain";
import { redemptionPayoutInstructions, type Db } from "@pontis/db";
import { ftTransferCallAction, redeemMsg } from "@pontis/near-client";
import { AppError, notFound } from "../errors.ts";
import type { CustodyRepository } from "./chain.ts";
import { CUSTODY_NOTICE, ISSUER_SOURCE, iso } from "./labels.ts";
import { payoutInstructionHash } from "./payout.ts";
import { requireRepresentation } from "./service.ts";

export interface PrepareDeps {
  db: Db;
  chain: CustodyRepository;
  coreId: string;
  now: () => Date;
}

/** Exits stay possible from a restricted asset; a paused or deprecated one refuses (the contract's rule). */
const REDEEMABLE = new Set(["active", "restricted"]);

export async function prepareRedemption(
  deps: PrepareDeps,
  accountId: string,
  body: PrepareRedemptionRequest,
): Promise<{ response: PrepareRedemptionResponse; payoutInstructionHash: string }> {
  const { db, chain } = deps;
  await requireRepresentation(db, body.representationId);
  const rep = await chain.getRepresentation(body.representationId);
  if (!rep) throw notFound(`Asset ${body.representationId}`);
  if (!REDEEMABLE.has(rep.status)) {
    throw new AppError(
      "ASSET_PAUSED",
      422,
      `${body.representationId} is ${rep.status}; redemption is closed for it`,
    );
  }
  const record = await chain.getRedemptionTerms(body.representationId);
  if (!record) {
    throw new AppError(
      "NOT_FOUND",
      404,
      `${body.representationId} has no enforced redemption terms; it cannot be redeemed through Pontis`,
    );
  }
  if (body.termsHash !== undefined && body.termsHash !== record.terms_hash) {
    throw new AppError(
      "REDEMPTION_TERMS_CHANGED",
      409,
      "The redemption terms changed since they were shown; read them again and confirm",
    );
  }

  const t = record.terms;
  const amount = BigInt(body.amount);
  if (amount < BigInt(t.min_amount)) {
    throw new AppError("REDEMPTION_BELOW_MIN", 409, `The minimum redemption is ${t.min_amount}`);
  }
  if (BigInt(t.max_amount) !== 0n && amount > BigInt(t.max_amount)) {
    throw new AppError("REDEMPTION_ABOVE_MAX", 409, `The maximum redemption is ${t.max_amount}`);
  }
  const window = {
    anchorMs: t.window_anchor_ms,
    lengthMs: t.window_length_ms,
    periodMs: t.window_period_ms,
  };
  const nowMs = deps.now().getTime();
  if (!redemptionWindowOpen(window, nowMs)) {
    const next = nextRedemptionWindowMs(window, nowMs);
    throw new AppError(
      "REDEMPTION_WINDOW_CLOSED",
      409,
      next === null
        ? "The redemption window is closed"
        : `The redemption window is closed; it opens next at ${iso(next)}`,
    );
  }

  const hash = payoutInstructionHash(body.payoutInstruction);
  const msg = redeemMsg(record.terms_hash, hash);
  const { fee, net } = redemptionFee(amount, t.fee_bps);
  const [stored] = await db
    .insert(redemptionPayoutInstructions)
    .values({
      accountId,
      representationId: body.representationId,
      amount: body.amount,
      termsHash: record.terms_hash,
      payoutInstructionHash: hash,
      ciphertext: body.payoutInstruction,
    })
    .returning({ id: redemptionPayoutInstructions.id });
  if (!stored) throw new Error("payout instruction insert returned no row");

  return {
    payoutInstructionHash: hash,
    response: {
      prepareId: stored.id,
      representationId: body.representationId,
      amount: body.amount,
      termsHash: record.terms_hash,
      termsVersion: record.version,
      payoutInstructionHash: hash,
      msg,
      feeUnits: fee.toString(),
      netUnits: net.toString(),
      actions: [
        ftTransferCallAction({
          tokenId: rep.account_id,
          receiverId: deps.coreId,
          amount: body.amount,
          msg,
        }),
      ],
      simulated: true,
      sources: [ISSUER_SOURCE],
      notice: CUSTODY_NOTICE,
    },
  };
}
