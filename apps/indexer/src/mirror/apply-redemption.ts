// Mint request, redemption terms and redemption events (ADR 0020 sections 6 and 7) applied to
// their mirror tables. Called only for an event just stored in `settlement_events`.

import {
  issuerReliability,
  mintRequests,
  redemptionEvents,
  redemptionPayoutInstructions,
  redemptionRefusals,
  redemptionTerms,
  redemptions,
  type DbTx,
  type RedemptionEventKind,
} from "@pontis/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { MirrorEvent } from "./events.ts";
import { date, type Where } from "./where.ts";

async function markIssuerStale(tx: DbTx, issuerId: string): Promise<void> {
  await tx
    .insert(issuerReliability)
    .values({ issuerId })
    .onConflictDoUpdate({ target: issuerReliability.issuerId, set: { needsRefresh: true } });
}

/** The timeline row of a redemption event, and the issuer's counters marked for a refresh. */
async function timeline(
  w: Where,
  redemptionId: number,
  kind: RedemptionEventKind,
  atMs: number,
  data: Record<string, unknown>,
): Promise<void> {
  await w.tx
    .insert(redemptionEvents)
    .values({
      redemptionId,
      kind,
      at: date(atMs),
      receiptId: w.receiptId,
      logIndex: w.logIndex,
      blockHeight: w.blockHeight,
      data,
    })
    .onConflictDoNothing();
  const [row] = await w.tx
    .select({ issuerId: redemptions.issuerId })
    .from(redemptions)
    .where(eq(redemptions.id, redemptionId));
  if (row) await markIssuerStale(w.tx, row.issuerId);
}

/**
 * Ties the oldest prepared, still unlinked payout instruction of this user and hash to the
 * redemption the chain just created. The ciphertext is not read: only the hash and the account
 * match. Nothing is linked when the user redeemed without preparing (the instruction is then not
 * stored by this API).
 */
async function linkPayoutInstruction(
  w: Where,
  redemptionId: number,
  accountId: string,
  payoutInstructionHash: string,
): Promise<void> {
  const [prepared] = await w.tx
    .select({ id: redemptionPayoutInstructions.id })
    .from(redemptionPayoutInstructions)
    .where(
      and(
        eq(redemptionPayoutInstructions.accountId, accountId),
        eq(redemptionPayoutInstructions.payoutInstructionHash, payoutInstructionHash),
        isNull(redemptionPayoutInstructions.redemptionId),
      ),
    )
    .orderBy(asc(redemptionPayoutInstructions.createdAt))
    .limit(1);
  if (prepared)
    await w.tx
      .update(redemptionPayoutInstructions)
      .set({ redemptionId })
      .where(eq(redemptionPayoutInstructions.id, prepared.id));
}

async function setRedemption(
  w: Where,
  id: number,
  set: Partial<typeof redemptions.$inferInsert>,
): Promise<void> {
  await w.tx.update(redemptions).set(set).where(eq(redemptions.id, id));
}

export async function applyMintOrRedemption(w: Where, event: MirrorEvent): Promise<void> {
  const { tx } = w;
  switch (event.name) {
    case "mint_requested": {
      const d = event.data;
      await tx
        .insert(mintRequests)
        .values({
          id: d.id,
          representationId: d.representation_id,
          recipient: d.recipient,
          amount: d.amount,
          reference: d.reference,
          status: "requested",
          requestedBy: d.requested_by,
          requestedAt: date(d.timestamp_ms),
        })
        .onConflictDoNothing();
      return;
    }
    case "mint_completed": {
      const d = event.data;
      await tx
        .update(mintRequests)
        .set({ status: "minted", resolvedAt: date(d.timestamp_ms), failure: null })
        .where(eq(mintRequests.id, d.id));
      return;
    }
    case "mint_failed": {
      const d = event.data;
      await tx
        .update(mintRequests)
        .set({ status: "failed", resolvedAt: date(d.timestamp_ms), failure: d.reason })
        .where(eq(mintRequests.id, d.id));
      return;
    }
    case "mint_cancelled": {
      const d = event.data;
      await tx
        .update(mintRequests)
        .set({ status: "cancelled", resolvedAt: date(d.timestamp_ms) })
        .where(eq(mintRequests.id, d.id));
      return;
    }
    case "redemption_terms_set": {
      const d = event.data;
      await tx
        .insert(redemptionTerms)
        .values({
          representationId: d.representation_id,
          version: d.version,
          termsHash: d.terms_hash,
          minAmount: d.terms.min_amount,
          maxAmount: d.terms.max_amount,
          feeBps: d.terms.fee_bps,
          windowAnchorMs: d.terms.window_anchor_ms,
          windowLengthMs: d.terms.window_length_ms,
          windowPeriodMs: d.terms.window_period_ms,
          acceptWithinMs: d.terms.accept_within_ms,
          settlementDays: d.terms.settlement_days,
          setBy: d.by,
          setAt: date(d.timestamp_ms),
          receiptId: w.receiptId,
          logIndex: w.logIndex,
        })
        .onConflictDoNothing();
      return;
    }
    case "redemption_requested": {
      const d = event.data;
      await tx
        .insert(redemptions)
        .values({
          id: d.id,
          userAccountId: d.user,
          representationId: d.representation_id,
          issuerId: d.issuer_id,
          amount: d.amount,
          feeBps: d.fee_bps,
          feeUnits: d.fee_units,
          netUnits: (BigInt(d.amount) - BigInt(d.fee_units)).toString(),
          termsHash: d.terms_hash,
          termsVersion: d.terms_version,
          payoutInstructionHash: d.payout_instruction_hash,
          status: "requested",
          createdAt: date(d.timestamp_ms),
          acceptDeadlineAt: date(d.accept_deadline_ms),
        })
        .onConflictDoNothing();
      await markIssuerStale(tx, d.issuer_id);
      await linkPayoutInstruction(w, d.id, d.user, d.payout_instruction_hash);
      await timeline(w, d.id, "requested", d.timestamp_ms, d);
      return;
    }
    case "redemption_refused": {
      // The escrow came straight back and no redemption exists; the row is the user's explanation.
      const d = event.data;
      await tx
        .insert(redemptionRefusals)
        .values({
          receiptId: w.receiptId,
          logIndex: w.logIndex,
          blockHeight: w.blockHeight,
          reason: d.reason,
          senderId: d.sender_id,
          token: d.token,
          amount: d.amount,
          at: date(d.timestamp_ms),
        })
        .onConflictDoNothing();
      return;
    }
    case "redemption_accepted": {
      const d = event.data;
      await setRedemption(w, d.id, {
        status: "accepted",
        acceptedAt: date(d.accepted_ms),
        fulfilDeadlineAt: date(d.fulfil_deadline_ms),
      });
      await timeline(w, d.id, "accepted", d.timestamp_ms, d);
      return;
    }
    case "redemption_rejected": {
      const d = event.data;
      await setRedemption(w, d.id, {
        status: "rejected",
        rejectReason: d.reason,
        resolvedAt: date(d.timestamp_ms),
      });
      await timeline(w, d.id, "rejected", d.timestamp_ms, d);
      return;
    }
    case "redemption_fulfilled": {
      const d = event.data;
      await setRedemption(w, d.id, {
        status: "fulfilled",
        fulfilmentEvidenceHash: d.evidence_hash,
        resolvedAt: date(d.timestamp_ms),
      });
      await timeline(w, d.id, "fulfilled", d.timestamp_ms, d);
      return;
    }
    case "redemption_fulfil_failed": {
      // The contract puts the redemption back to accepted; nothing in the row changed.
      await timeline(w, event.data.id, "fulfil_failed", event.data.timestamp_ms, event.data);
      return;
    }
    case "redemption_expired": {
      const d = event.data;
      await setRedemption(w, d.id, {
        status: "expired",
        miss: d.miss,
        resolvedAt: date(d.timestamp_ms),
      });
      await timeline(w, d.id, "expired", d.timestamp_ms, d);
      return;
    }
    case "redemption_reclaimed": {
      const d = event.data;
      await setRedemption(w, d.id, { status: "reclaimed", resolvedAt: date(d.timestamp_ms) });
      await timeline(w, d.id, "reclaimed", d.timestamp_ms, d);
      return;
    }
    case "redemption_reclaim_failed": {
      await timeline(w, event.data.id, "reclaim_failed", event.data.timestamp_ms, event.data);
      return;
    }
    default:
      return;
  }
}
