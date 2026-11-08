// Shapes returned by pontis-core views (contracts/pontis-core/src/types.rs), validated at runtime
// so a contract and client that drift apart fail loudly instead of corrupting the database.
// Field names are the contract's snake_case; timestamps are milliseconds since epoch.

import {
  BRIDGE_STATUSES,
  COMPATIBILITY_CLASSIFICATIONS,
  EVIDENCE_PROVENANCES,
  RECORD_STATUSES,
  RELATIONSHIP_STATUSES,
  REVIEW_ACTIONS,
  VERIFICATION_STATUSES,
} from "@pontis/domain";
import { z } from "zod";

const accountId = z.string().min(2).max(64);
/** u128 values arrive as decimal strings. */
const amount = z.string().regex(/^(0|[1-9][0-9]*)$/);
const timestampMs = z.number().int().nonnegative();
const flags = {
  synthetic: z.boolean(),
  verification_status: z.enum(VERIFICATION_STATUSES),
  status: z.enum(RECORD_STATUSES),
};

export const ChainRatioSchema = z.object({ num: amount, den: amount });

export const ChainEvidenceSchema = z.object({
  uri: z.string(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  provenance: z.enum(EVIDENCE_PROVENANCES),
  description: z.string(),
  added_by: accountId,
  timestamp_ms: timestampMs,
});

export const ChainIssuerSchema = z.object({
  id: z.string(),
  name: z.string(),
  jurisdiction: z.string().nullable(),
  authorized_categories: z.array(z.string()),
  controlled_accounts: z.array(accountId),
  contact: z.string().nullable(),
  evidence: z.array(ChainEvidenceSchema),
  registered_by: accountId,
  registered_at_ms: timestampMs,
  last_reviewed_ms: timestampMs.nullable(),
  ...flags,
});

export const ChainCanonicalAssetSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  claim_description: z.string(),
  unit_definition: z.string(),
  denomination: z.string().nullable(),
  economic_rights: z.string(),
  legal_claim_structure: z.string(),
  jurisdiction: z.string().nullable(),
  redemption_terms: z.string(),
  valuation_method: z.string().nullable(),
  eligibility_restrictions: z.string(),
  risk_disclosures: z.array(z.string()),
  evidence: z.array(ChainEvidenceSchema),
  registered_by: accountId,
  registered_at_ms: timestampMs,
  last_reviewed_ms: timestampMs.nullable(),
  ...flags,
});

export const ChainRepresentationSchema = z.object({
  id: z.string(),
  canonical_asset_id: z.string(),
  issuer_id: z.string(),
  account_id: accountId,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(38),
  unit_multiplier: ChainRatioSchema,
  admin_capabilities: z.array(z.string()),
  custody_description: z.string(),
  redemption_mechanism: z.string(),
  transfer_policy_summary: z.string(),
  bridge_status: z.enum(BRIDGE_STATUSES),
  evidence: z.array(ChainEvidenceSchema),
  registered_by: accountId,
  registered_at_ms: timestampMs,
  last_reviewed_ms: timestampMs.nullable(),
  ...flags,
});

export const ChainCompatibilityVersionSchema = z.object({
  version: z.number().int().positive(),
  action: z.enum(REVIEW_ACTIONS),
  classification: z.enum(COMPATIBILITY_CLASSIFICATIONS),
  status: z.enum(RELATIONSHIP_STATUSES),
  ratio: ChainRatioSchema,
  scope: z.string(),
  rationale: z.string(),
  actor: accountId,
  timestamp_ms: timestampMs,
});

export const ChainCompatibilitySchema = z.object({
  id: z.string(),
  representation_a_id: z.string(),
  representation_b_id: z.string(),
  classification: z.enum(COMPATIBILITY_CLASSIFICATIONS),
  ratio: ChainRatioSchema,
  scope: z.string(),
  rationale: z.string(),
  status: z.enum(RELATIONSHIP_STATUSES),
  version: z.number().int().positive(),
  proposed_by: accountId,
  approved_by: accountId.nullable(),
  evidence: z.array(ChainEvidenceSchema),
  history: z.array(ChainCompatibilityVersionSchema),
  updated_at_ms: timestampMs,
});

export const ChainPolicySchema = z.object({
  representation_id: z.string(),
  allowlist_required: z.boolean(),
  policy_version: z.number().int().nonnegative(),
});

export type ChainEvidence = z.infer<typeof ChainEvidenceSchema>;
export type ChainIssuer = z.infer<typeof ChainIssuerSchema>;
export type ChainCanonicalAsset = z.infer<typeof ChainCanonicalAssetSchema>;
export type ChainRepresentation = z.infer<typeof ChainRepresentationSchema>;
export type ChainCompatibility = z.infer<typeof ChainCompatibilitySchema>;
export type ChainPolicy = z.infer<typeof ChainPolicySchema>;
export type ChainCompatibilityVersion = z.infer<typeof ChainCompatibilityVersionSchema>;
