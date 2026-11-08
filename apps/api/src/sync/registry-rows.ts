// Chain record to table row. Pure, so the mapping is tested without a database.

import type {
  ChainCanonicalAsset,
  ChainCompatibility,
  ChainCompatibilityVersion,
  ChainEvidence,
  ChainIssuer,
  ChainPolicy,
  ChainRepresentation,
} from "@pontis/near-client";
import type {
  assetEvidence,
  assetRepresentations,
  canonicalAssets,
  compatibilityRelationships,
  compatibilityReviews,
  issuers,
} from "@pontis/db";

const date = (ms: number | null) => (ms === null ? null : new Date(ms));
const common = (r: ChainIssuer | ChainCanonicalAsset | ChainRepresentation) => ({
  registeredBy: r.registered_by,
  registeredAt: new Date(r.registered_at_ms),
  lastReviewedAt: date(r.last_reviewed_ms),
  synthetic: r.synthetic,
  verificationStatus: r.verification_status,
  status: r.status,
});

export const issuerRow = (i: ChainIssuer): typeof issuers.$inferInsert => ({
  id: i.id,
  name: i.name,
  jurisdiction: i.jurisdiction,
  authorizedCategories: i.authorized_categories,
  controlledAccounts: i.controlled_accounts,
  contact: i.contact,
  ...common(i),
});

export const claimRow = (c: ChainCanonicalAsset): typeof canonicalAssets.$inferInsert => ({
  id: c.id,
  name: c.name,
  category: c.category,
  claimDescription: c.claim_description,
  unitDefinition: c.unit_definition,
  denomination: c.denomination,
  economicRights: c.economic_rights,
  legalClaimStructure: c.legal_claim_structure,
  jurisdiction: c.jurisdiction,
  redemptionTerms: c.redemption_terms,
  valuationMethod: c.valuation_method,
  eligibilityRestrictions: c.eligibility_restrictions,
  riskDisclosures: c.risk_disclosures,
  ...common(c),
});

export const representationRow = (
  r: ChainRepresentation,
  policy: ChainPolicy | null,
  inventory: string,
): typeof assetRepresentations.$inferInsert => ({
  id: r.id,
  canonicalAssetId: r.canonical_asset_id,
  issuerId: r.issuer_id,
  accountId: r.account_id,
  name: r.name,
  symbol: r.symbol,
  decimals: r.decimals,
  unitMultiplierNum: r.unit_multiplier.num,
  unitMultiplierDen: r.unit_multiplier.den,
  adminCapabilities: r.admin_capabilities,
  custodyDescription: r.custody_description,
  redemptionMechanism: r.redemption_mechanism,
  transferPolicySummary: r.transfer_policy_summary,
  bridgeStatus: r.bridge_status,
  allowlistRequired: policy?.allowlist_required ?? true,
  vaultInventory: inventory,
  ...common(r),
});

export const relationshipRow = (
  c: ChainCompatibility,
): typeof compatibilityRelationships.$inferInsert => ({
  id: c.id,
  representationAId: c.representation_a_id,
  representationBId: c.representation_b_id,
  classification: c.classification,
  ratioNum: c.ratio.num,
  ratioDen: c.ratio.den,
  scope: c.scope,
  rationale: c.rationale,
  status: c.status,
  version: c.version,
  proposedBy: c.proposed_by,
  approvedBy: c.approved_by,
  updatedAt: new Date(c.updated_at_ms),
});

export const reviewRow = (
  relationshipId: string,
  h: ChainCompatibilityVersion,
): typeof compatibilityReviews.$inferInsert => ({
  relationshipId,
  version: h.version,
  action: h.action,
  classification: h.classification,
  status: h.status,
  ratioNum: h.ratio.num,
  ratioDen: h.ratio.den,
  scope: h.scope,
  rationale: h.rationale,
  actor: h.actor,
  at: new Date(h.timestamp_ms),
});

export const evidenceRow = (
  subjectType: "issuer" | "canonical_asset" | "representation" | "compatibility",
  subjectId: string,
  e: ChainEvidence,
): typeof assetEvidence.$inferInsert => ({
  subjectType,
  subjectId,
  uri: e.uri,
  sha256: e.sha256,
  provenance: e.provenance,
  description: e.description,
  addedBy: e.added_by,
  addedAt: new Date(e.timestamp_ms),
});
