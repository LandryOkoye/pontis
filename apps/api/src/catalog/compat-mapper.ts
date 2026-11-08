// Relationship rows to `Compatibility`, from one asset's point of view.

import type { Compatibility } from "@pontis/api-types";
import {
  evidence,
  iso,
  type EvidenceRow,
  type RelationshipRow,
  type ReviewRow,
} from "./mappers.ts";

/**
 * A relationship seen from `assetId`. Ratios are stored in the `a` to `b` direction; from the `b`
 * side they are inverted so `ratio` always reads "counterpart units per unit of this asset".
 */
export function compatibility(
  assetId: string,
  rel: RelationshipRow,
  reviews: ReviewRow[],
  ev: EvidenceRow[],
): Compatibility {
  const fromB = assetId === rel.representationBId;
  const directional = (num: string, den: string) => (fromB ? { num: den, den: num } : { num, den });
  return {
    id: rel.id,
    counterpartId: fromB ? rel.representationAId : rel.representationBId,
    classification: rel.classification,
    ratio: directional(rel.ratioNum, rel.ratioDen),
    scope: rel.scope,
    rationale: rel.rationale,
    version: rel.version,
    status: rel.status,
    parityEnabled: rel.classification === "DIRECT_EQUIVALENT" && rel.status === "approved",
    proposedBy: rel.proposedBy,
    approvedBy: rel.approvedBy,
    updatedAt: iso(rel.updatedAt),
    evidence: evidence(ev),
    history: reviews.map((h) => ({
      version: h.version,
      action: h.action,
      classification: h.classification,
      status: h.status,
      ratio: directional(h.ratioNum, h.ratioDen),
      scope: h.scope,
      rationale: h.rationale,
      actor: h.actor,
      at: iso(h.at),
    })),
  };
}
