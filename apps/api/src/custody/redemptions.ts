// GET /v1/redemptions and /v1/redemptions/{id} (ADR 0020 section 7): a redemption escrows the
// whole amount and ends in a burn (fulfilled) or a return (reclaimed). Read from the chain; the
// timeline is rebuilt from the record because the chain view keeps no event log. Fee and net are
// what a simulated issuer owes off-chain: no value moves except the token.

import type { Redemption, RedemptionList, RedemptionSummary } from "@pontis/api-types";
import type { RedemptionStatus } from "@pontis/domain";
import type { Db } from "@pontis/db";
import type { ChainRedemption } from "@pontis/near-client";
import { AppError, notFound } from "../errors.ts";
import type { CustodyRepository } from "./chain.ts";
import { CUSTODY_NOTICE, ISSUER_SOURCE, iso, isoOrNull } from "./labels.ts";
import { newestFirst } from "./paging.ts";
import { requireRepresentation, type PageRequest } from "./service.ts";

const labels = { simulated: true, sources: [ISSUER_SOURCE], notice: CUSTODY_NOTICE };

/** Rejected and expired requests can be reclaimed; so can one whose deadline has passed (it expires first). */
export function isReclaimable(r: ChainRedemption, nowMs: number): boolean {
  if (r.status === "rejected" || r.status === "expired") return true;
  if (r.status === "requested") return nowMs > r.accept_deadline_ms;
  if (r.status === "accepted") return r.fulfil_deadline_ms !== null && nowMs > r.fulfil_deadline_ms;
  return false;
}

function summary(r: ChainRedemption, nowMs: number): RedemptionSummary {
  return {
    id: String(r.id),
    user: r.user,
    assetId: r.representation_id,
    issuerId: r.issuer_id,
    amount: r.amount,
    feeBps: r.fee_bps,
    feeUnits: r.fee_units,
    netUnits: r.net_units,
    termsHash: r.terms_hash,
    termsVersion: r.terms_version,
    payoutInstructionHash: r.payout_instruction_hash,
    status: r.status,
    createdAt: iso(r.created_ms),
    acceptDeadline: iso(r.accept_deadline_ms),
    acceptedAt: isoOrNull(r.accepted_ms),
    fulfilDeadline: isoOrNull(r.fulfil_deadline_ms),
    resolvedAt: isoOrNull(r.resolved_ms),
    fulfilmentEvidenceHash: r.fulfilment_evidence_hash,
    rejectReason: r.reject_reason,
    miss: r.miss,
    settlementDays: r.settlement_days,
    reclaimable: isReclaimable(r, nowMs),
    ...labels,
  };
}

/**
 * The steps the record shows, in order. `resolved_ms` is the time of the latest transition, so it
 * dates a terminal step only when that step is the latest; an earlier rejection or expiry that a
 * reclaim followed has no time here. The indexer's event mirror will fill the gaps.
 */
export function timeline(r: ChainRedemption): Redemption["timeline"] {
  const steps: Redemption["timeline"] = [
    { event: "requested", at: iso(r.created_ms), txHash: null },
  ];
  if (r.accepted_ms !== null)
    steps.push({ event: "accepted", at: iso(r.accepted_ms), txHash: null });
  const resolvedAt = isoOrNull(r.resolved_ms);
  const latest = (status: RedemptionStatus) => (r.status === status ? resolvedAt : null);
  if (r.reject_reason !== null)
    steps.push({ event: "rejected", at: latest("rejected"), txHash: null });
  if (r.miss !== null) steps.push({ event: "expired", at: latest("expired"), txHash: null });
  if (r.status === "fulfilled") steps.push({ event: "fulfilled", at: resolvedAt, txHash: null });
  if (r.status === "reclaimed") steps.push({ event: "reclaimed", at: resolvedAt, txHash: null });
  return steps;
}

export async function getRedemption(
  chain: CustodyRepository,
  id: string,
  now: Date,
): Promise<Redemption> {
  const r = await chain.getRedemption(Number(id));
  if (!r) throw notFound(`Redemption ${id}`);
  return { ...summary(r, now.getTime()), timeline: timeline(r) };
}

export interface RedemptionFilter extends PageRequest {
  user?: string | undefined;
  representationId?: string | undefined;
  status?: RedemptionStatus | undefined;
}

export async function listRedemptions(
  db: Db,
  chain: CustodyRepository,
  filter: RedemptionFilter,
  now: Date,
): Promise<RedemptionList> {
  const { user, representationId, status } = filter;
  if (user === undefined && representationId === undefined) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Give user or representationId: the chain lists redemptions by account or by asset.",
    );
  }
  if (representationId !== undefined) await requireRepresentation(db, representationId);
  const page = await newestFirst(
    (from, limit) =>
      user !== undefined
        ? chain.getRedemptionsByUser(user, from, limit)
        : chain.getRedemptionsByRepresentation(representationId as string, from, limit),
    {
      cursor: filter.cursor,
      limit: filter.limit,
      query: { user, representationId, status },
    },
  );
  return {
    items: page.items
      .filter(
        (r) =>
          (status === undefined || r.status === status) &&
          (representationId === undefined || r.representation_id === representationId),
      )
      .map((r) => summary(r, now.getTime())),
    nextCursor: page.nextCursor,
    ...labels,
  };
}
