// Table row to API shape (`@pontis/api-types`). Pure, so the contract with the frontend is tested
// without a database. Amounts and ratios stay decimal strings; times are ISO-8601 UTC.

import type { CanonicalAsset, Evidence, Issuer, IssuerSummary } from "@pontis/api-types";
import type {
  assetEvidence,
  assetRepresentations,
  canonicalAssets,
  compatibilityRelationships,
  compatibilityReviews,
  issuers,
} from "@pontis/db";

export type IssuerRow = typeof issuers.$inferSelect;
export type ClaimRow = typeof canonicalAssets.$inferSelect;
export type RepresentationRow = typeof assetRepresentations.$inferSelect;
export type EvidenceRow = typeof assetEvidence.$inferSelect;
export type RelationshipRow = typeof compatibilityRelationships.$inferSelect;
export type ReviewRow = typeof compatibilityReviews.$inferSelect;

export const iso = (d: Date) => d.toISOString();
export const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);
export const flags = (r: {
  synthetic: boolean;
  verificationStatus: IssuerRow["verificationStatus"];
}) => ({
  synthetic: r.synthetic,
  verificationStatus: r.verificationStatus,
});

/** Evidence rows arrive ordered by (added_at, id); the index makes the API id stable between syncs. */
export function evidence(rows: EvidenceRow[]): Evidence[] {
  return rows.map((e, i) => ({
    id: `${e.subjectType}:${e.subjectId}:${i}`,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    uri: e.uri,
    sha256: e.sha256,
    provenance: e.provenance,
    description: e.description,
    addedBy: e.addedBy,
    addedAt: iso(e.addedAt),
  }));
}

export const issuerSummary = (i: IssuerRow): IssuerSummary => ({
  id: i.id,
  name: i.name,
  status: i.status,
  ...flags(i),
});

export const issuer = (i: IssuerRow, ev: EvidenceRow[]): Issuer => ({
  ...issuerSummary(i),
  jurisdiction: i.jurisdiction,
  authorizedCategories: i.authorizedCategories,
  controlledAccounts: i.controlledAccounts,
  contact: i.contact,
  lastReviewedAt: isoOrNull(i.lastReviewedAt),
  evidence: evidence(ev),
});

export const canonicalAsset = (c: ClaimRow): CanonicalAsset => ({
  id: c.id,
  name: c.name,
  category: c.category,
  claimDescription: c.claimDescription,
  unitDefinition: c.unitDefinition,
  denomination: c.denomination,
  economicRights: c.economicRights,
  legalClaimStructure: c.legalClaimStructure,
  jurisdiction: c.jurisdiction,
  redemptionTerms: c.redemptionTerms,
  valuationMethod: c.valuationMethod,
  eligibilityRestrictions: c.eligibilityRestrictions,
  riskDisclosures: c.riskDisclosures,
  status: c.status,
  lastReviewedAt: isoOrNull(c.lastReviewedAt),
  ...flags(c),
});
