// Shapes returned by pontis-core views (contracts/pontis-core/src/types.rs), validated at runtime
// so a contract and client that drift apart fail loudly instead of corrupting the database.
// Field names are the contract's snake_case; timestamps are milliseconds since epoch.

import {
  ACTION_KINDS,
  ACTION_STATUSES,
  ASSET_KINDS,
  BRIDGE_STATUSES,
  COMPATIBILITY_CLASSIFICATIONS,
  EVIDENCE_PROVENANCES,
  LIFECYCLE_STAGES,
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

/** Why `pontis-core.get_route` refuses a pair (contracts/pontis-core/src/route.rs). */
export const ROUTE_REFUSALS = [
  "asset_not_found",
  "asset_paused",
  "asset_not_active",
  "no_relationship",
  "relationship_not_approved",
  "relationship_suspended",
  "not_direct_equivalent",
  "price_deviation",
  "price_stale",
  "price_missing",
  "price_unavailable",
  "corporate_action_freeze",
  "corporate_action_pending",
  "epoch_mismatch",
  "not_convertible",
  "lifecycle_blocked",
  "nav_window_closed",
  "reserve_restricted",
  "reserve_stale",
] as const;
export type RouteRefusal = (typeof ROUTE_REFUSALS)[number];

export const ChainRouteViewSchema = z.object({
  executable: z.boolean(),
  refusal: z.enum(ROUTE_REFUSALS).nullable(),
  terms: z
    .object({
      /** Output smallest units of the destination per smallest unit of the source. */
      ratio: ChainRatioSchema,
      compatibility_version: z.number().int().positive(),
      policy_version: z.number().int().nonnegative(),
    })
    .nullable(),
  /** The start of the next approved freeze window of either claim, if one is still ahead. */
  next_freeze_ms: timestampMs.nullable(),
});
export type ChainRouteView = z.infer<typeof ChainRouteViewSchema>;

/** The latest accepted price of a representation (`get_price`, ADR 0016 section 1). */
export const ChainPriceSchema = z.object({
  /** Price of one whole token at 8 decimals, as a decimal string of the integer. */
  price: z.string().regex(/^(0|[1-9][0-9]*)$/),
  currency: z.string(),
  as_of_ms: timestampMs,
  submitted_ms: timestampMs,
  simulated: z.boolean(),
  source: z.string(),
  publisher_key: z.string(),
});
export type ChainPrice = z.infer<typeof ChainPriceSchema>;

/** One line of `get_route_guards`: what was checked and the verdict (ADR 0016 section 6). */
export const GuardCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});

export const ChainRouteGuardsSchema = z.object({
  executable: z.boolean(),
  checks: z.array(GuardCheckSchema),
  /** The fee the contract charges for the amount asked about, skew included; null without an amount. */
  fee_bps: z.number().int().min(0).max(10_000).nullable(),
  skew_bps: z.number().int().min(0).max(10_000).nullable(),
  /** A stale or missing price is tolerated at a wider fee. */
  degraded: z.boolean(),
});
export type GuardCheck = z.infer<typeof GuardCheckSchema>;
export type ChainRouteGuards = z.infer<typeof ChainRouteGuardsSchema>;

/** One step of a representation's multiplier schedule; the first is `genesis` at time 0 (ADR 0017). */
export const ChainMultiplierEpochSchema = z.object({
  effective_ms: timestampMs,
  multiplier: ChainRatioSchema,
  action_id: z.string(),
});

export const ChainActionHistoryEntrySchema = z.object({
  status: z.enum(ACTION_STATUSES),
  by: accountId,
  at_ms: timestampMs,
  note: z.string(),
});

/** A corporate action on a canonical asset (`get_corporate_actions`, ADR 0017 section 1). */
export const ChainCorporateActionSchema = z.object({
  id: z.string(),
  asset_id: z.string(),
  kind: z.enum(ACTION_KINDS),
  announced_at_ms: timestampMs,
  ex_date_ms: timestampMs,
  effective_ms: timestampMs,
  freeze_from_ms: timestampMs,
  freeze_until_ms: timestampMs,
  /** `new = old * change` for every wrapper; null when the action does not move the multiplier. */
  multiplier_change: ChainRatioSchema.nullable(),
  evidence: z.array(ChainEvidenceSchema),
  status: z.enum(ACTION_STATUSES),
  proposed_by: accountId,
  approved_by: accountId.nullable(),
  /** Representations that have applied the action so far. */
  applied_representations: z.array(z.string()),
  history: z.array(ChainActionHistoryEntrySchema),
});

export const ChainLifecycleEntrySchema = z.object({
  from: z.enum(LIFECYCLE_STAGES),
  to: z.enum(LIFECYCLE_STAGES),
  by: accountId,
  at_ms: timestampMs,
  evidence_hash: z.string().nullable(),
  note: z.string(),
});

/** The lifecycle record of a representation (`get_lifecycle`, ADR 0018 section 1). */
export const ChainLifecycleSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  no_conversion: z.boolean(),
  bridge_only: z.boolean(),
  stage: z.enum(LIFECYCLE_STAGES),
  history: z.array(ChainLifecycleEntrySchema),
  delist_request: z
    .object({
      by: accountId,
      evidence_hash: z.string().nullable(),
      note: z.string(),
      at_ms: timestampMs,
    })
    .nullable(),
});

/** The latest NAV strike of a `nav_fund` (`get_nav_strike`, ADR 0018 section 4). */
export const ChainNavStrikeSchema = z.object({
  as_of_ms: timestampMs,
  /** NAV of one whole token at 8 decimals, as a decimal string of the integer. */
  nav_per_unit: amount,
  cutoff_ms: timestampMs,
  currency: z.string(),
  source: z.string(),
  simulated: z.boolean(),
  submitted_ms: timestampMs,
  publisher_key: z.string(),
});
export type ChainMultiplierEpoch = z.infer<typeof ChainMultiplierEpochSchema>;
export type ChainCorporateAction = z.infer<typeof ChainCorporateActionSchema>;
export type ChainLifecycle = z.infer<typeof ChainLifecycleSchema>;
export type ChainNavStrike = z.infer<typeof ChainNavStrikeSchema>;
