// Redemption checks (ADR 0020 section 7): a redemption left open past its deadline, and the escrow
// the mirror believes the core holds for open redemptions against what the core's books and token
// balance say. Both read the mirror, so they are only as current as the indexer.

import { redemptionTerms, redemptions, type Db, type RedemptionStatus } from "@pontis/db";
import type { VaultReading } from "@pontis/api-types";
import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import type { Candidate } from "./finding.ts";

/** A redemption is overdue once its deadline passed this long ago (5 minutes). */
export const REDEMPTION_OVERDUE_AFTER_MS = 300_000;

/** Statuses whose full amount the core still holds in escrow (ADR 0020 section 7). */
export const OPEN_ESCROW_STATUSES: readonly RedemptionStatus[] = [
  "requested",
  "accepted",
  "rejected",
  "expired",
];

/** `requested` past its accept deadline or `accepted` past its fulfil deadline; anyone can expire it. */
export async function overdueRedemptions(db: Db, now: Date): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - REDEMPTION_OVERDUE_AFTER_MS);
  const rows = await db
    .select()
    .from(redemptions)
    .where(
      or(
        and(eq(redemptions.status, "requested"), lt(redemptions.acceptDeadlineAt, cutoff)),
        and(
          eq(redemptions.status, "accepted"),
          isNotNull(redemptions.fulfilDeadlineAt),
          lt(redemptions.fulfilDeadlineAt, cutoff),
        ),
      ),
    )
    .orderBy(redemptions.id);
  return rows.map((r): Candidate => {
    const accept = r.status === "requested";
    const deadline = (accept ? r.acceptDeadlineAt : r.fulfilDeadlineAt) ?? r.acceptDeadlineAt;
    const late = Math.floor((now.getTime() - deadline.getTime()) / 60_000);
    return {
      key: `redemption:${r.id}:overdue`,
      kind: "REDEMPTION_OVERDUE",
      severity: "warning",
      subject: String(r.id),
      message: `Redemption ${r.id} of ${r.representationId} for ${r.userAccountId} is still ${r.status} ${late} min after its ${accept ? "accept" : "fulfil"} deadline; anyone can call expire_redemption and the user can then reclaim the escrow`,
    };
  });
}

/** Representations that have redemption terms or requests, the only ones with escrow to account for. */
export async function escrowRepresentations(db: Db): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of await db
    .selectDistinct({ id: redemptionTerms.representationId })
    .from(redemptionTerms))
    ids.add(r.id);
  for (const r of await db.selectDistinct({ id: redemptions.representationId }).from(redemptions))
    ids.add(r.id);
  return ids;
}

/** Sum of the amounts the mirror shows in escrow, per representation. */
export async function mirroredEscrow(db: Db): Promise<Map<string, bigint>> {
  const rows = await db
    .select({
      id: redemptions.representationId,
      total: sql<string>`coalesce(sum(${redemptions.amount}), 0)::text`,
    })
    .from(redemptions)
    .where(inArray(redemptions.status, [...OPEN_ESCROW_STATUSES]))
    .groupBy(redemptions.representationId);
  return new Map(rows.map((r) => [r.id, BigInt(r.total)]));
}

/**
 * `ESCROW_MISMATCH`: the open escrows the mirror holds, plus the inventory and pending input the
 * core accounts for, should equal the core's token balance. A representation the vault check
 * already flags is skipped, because the mismatch is then not about escrow.
 *
 * `readings.inventory` already includes the core's escrow books (`held`); `held` is taken out to
 * put the mirror's figure in its place.
 */
export function escrowCandidates(
  readings: readonly VaultReading[],
  held: ReadonlyMap<string, bigint>,
  mirrored: ReadonlyMap<string, bigint>,
  skip: ReadonlySet<string>,
): Candidate[] {
  const found: Candidate[] = [];
  for (const r of readings) {
    const books = held.get(r.representationId) ?? 0n;
    const open = mirrored.get(r.representationId) ?? 0n;
    if (skip.has(r.representationId) || (books === 0n && open === 0n)) continue;
    const accounted = BigInt(r.inventory) - books;
    const expected = accounted + open;
    const balance = BigInt(r.balance);
    if (expected === balance) continue;
    found.push({
      key: `escrow:${r.representationId}:mismatch`,
      kind: "ESCROW_MISMATCH",
      severity: balance < expected ? "critical" : "warning",
      subject: r.representationId,
      message: `Open redemption escrow in the mirror (${open}) plus inventory and pending input (${accounted}) is ${expected}, but the core holds ${balance} tokens; the core's own escrow books say ${books}`,
    });
  }
  return found;
}
