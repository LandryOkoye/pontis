// Registry mirror: chain state copied into Postgres by the registry sync (BuildPlan B9). The chain
// is the authority; these tables are a queryable cache and are safe to rebuild from it.

import type {
  BridgeStatus,
  CompatibilityClassification,
  EvidenceProvenance,
  EvidenceSubjectType,
  RecordStatus,
  RelationshipStatus,
  ReviewAction,
  VerificationStatus,
} from "@pontis/domain";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** Token amounts and ratio parts: u128 fits in numeric(39, 0); read back as strings, never floats. */
const u128 = (name: string) => numeric(name, { precision: 39, scale: 0 });
const flags = {
  synthetic: boolean().notNull(),
  verificationStatus: text().$type<VerificationStatus>().notNull(),
  status: text().$type<RecordStatus>().notNull(),
};

export const issuers = pgTable("issuers", {
  id: text().primaryKey(),
  name: text().notNull(),
  jurisdiction: text(),
  authorizedCategories: jsonb().$type<string[]>().notNull(),
  controlledAccounts: jsonb().$type<string[]>().notNull(),
  contact: text(),
  registeredBy: text().notNull(),
  registeredAt: at("registered_at").notNull(),
  lastReviewedAt: at("last_reviewed_at"),
  ...flags,
});

export const canonicalAssets = pgTable("canonical_assets", {
  id: text().primaryKey(),
  name: text().notNull(),
  category: text().notNull(),
  claimDescription: text().notNull(),
  unitDefinition: text().notNull(),
  denomination: text(),
  economicRights: text().notNull(),
  legalClaimStructure: text().notNull(),
  jurisdiction: text(),
  redemptionTerms: text().notNull(),
  valuationMethod: text(),
  eligibilityRestrictions: text().notNull(),
  riskDisclosures: jsonb().$type<string[]>().notNull(),
  registeredBy: text().notNull(),
  registeredAt: at("registered_at").notNull(),
  lastReviewedAt: at("last_reviewed_at"),
  ...flags,
});

export const assetRepresentations = pgTable(
  "asset_representations",
  {
    id: text().primaryKey(),
    canonicalAssetId: text()
      .notNull()
      .references(() => canonicalAssets.id),
    issuerId: text()
      .notNull()
      .references(() => issuers.id),
    accountId: text().notNull(),
    standard: text().notNull().default("NEP-141"),
    name: text().notNull(),
    symbol: text().notNull(),
    decimals: integer().notNull(),
    unitMultiplierNum: u128("unit_multiplier_num").notNull(),
    unitMultiplierDen: u128("unit_multiplier_den").notNull(),
    adminCapabilities: jsonb().$type<string[]>().notNull(),
    custodyDescription: text().notNull(),
    redemptionMechanism: text().notNull(),
    transferPolicySummary: text().notNull(),
    bridgeStatus: text().$type<BridgeStatus>().notNull(),
    allowlistRequired: boolean().notNull(),
    vaultInventory: u128("vault_inventory").notNull(),
    registeredBy: text().notNull(),
    registeredAt: at("registered_at").notNull(),
    lastReviewedAt: at("last_reviewed_at"),
    ...flags,
  },
  (t) => [uniqueIndex("asset_representations_account_id_key").on(t.accountId)],
);

export const assetEvidence = pgTable(
  "asset_evidence",
  {
    id: serial().primaryKey(),
    subjectType: text().$type<EvidenceSubjectType>().notNull(),
    subjectId: text().notNull(),
    uri: text().notNull(),
    sha256: text().notNull(),
    provenance: text().$type<EvidenceProvenance>().notNull(),
    description: text().notNull(),
    addedBy: text().notNull(),
    addedAt: at("added_at").notNull(),
  },
  (t) => [index("asset_evidence_subject_idx").on(t.subjectType, t.subjectId)],
);

export const compatibilityRelationships = pgTable("compatibility_relationships", {
  id: text().primaryKey(),
  representationAId: text()
    .notNull()
    .references(() => assetRepresentations.id),
  representationBId: text()
    .notNull()
    .references(() => assetRepresentations.id),
  classification: text().$type<CompatibilityClassification>().notNull(),
  ratioNum: u128("ratio_num").notNull(),
  ratioDen: u128("ratio_den").notNull(),
  scope: text().notNull(),
  rationale: text().notNull(),
  status: text().$type<RelationshipStatus>().notNull(),
  version: bigint({ mode: "number" }).notNull(),
  proposedBy: text().notNull(),
  approvedBy: text(),
  updatedAt: at("updated_at").notNull(),
});

export const compatibilityReviews = pgTable(
  "compatibility_reviews",
  {
    id: serial().primaryKey(),
    relationshipId: text()
      .notNull()
      .references(() => compatibilityRelationships.id),
    version: bigint({ mode: "number" }).notNull(),
    action: text().$type<ReviewAction>().notNull(),
    classification: text().$type<CompatibilityClassification>().notNull(),
    status: text().$type<RelationshipStatus>().notNull(),
    ratioNum: u128("ratio_num").notNull(),
    ratioDen: u128("ratio_den").notNull(),
    scope: text().notNull(),
    rationale: text().notNull(),
    actor: text().notNull(),
    at: at("at").notNull(),
  },
  (t) => [
    uniqueIndex("compatibility_reviews_relationship_version_key").on(t.relationshipId, t.version),
  ],
);

export const transferPolicies = pgTable("transfer_policies", {
  representationId: text()
    .primaryKey()
    .references(() => assetRepresentations.id),
  allowlistRequired: boolean().notNull(),
  policyVersion: bigint({ mode: "number" }).notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
