// Records (issuers, assets, evidence, compatibility) as returned by the API.
import { z } from "zod";
import {
  AccountId,
  AmountString,
  ClassificationSchema,
  EvidenceProvenanceSchema,
  EvidenceSubjectTypeSchema,
  NetworkSchema,
  RationalSchema,
  RecordStatusSchema,
  RelationshipStatusSchema,
  ReviewActionSchema,
  Timestamp,
  VerificationStatusSchema,
} from "./common.ts";

/** Evidence reference. Provenance is always explicit; never infer "verified" from presence (ADR 0009). */
export const EvidenceSchema = z
  .object({
    id: z.string(),
    subjectType: EvidenceSubjectTypeSchema,
    subjectId: z.string(),
    uri: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provenance: EvidenceProvenanceSchema,
    description: z.string(),
    addedBy: AccountId,
    addedAt: Timestamp,
  })
  .meta({ id: "Evidence" });

/** Flags on every registry record (ADR 0009). */
const recordFlags = {
  synthetic: z.boolean(),
  verificationStatus: VerificationStatusSchema,
};

export const IssuerSummarySchema = z
  .object({ id: z.string(), name: z.string(), status: RecordStatusSchema, ...recordFlags })
  .meta({ id: "IssuerSummary" });

export const IssuerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    jurisdiction: z.string().nullable(),
    status: RecordStatusSchema,
    authorizedCategories: z.array(z.string()),
    controlledAccounts: z.array(AccountId),
    contact: z.string().nullable(),
    lastReviewedAt: Timestamp.nullable(),
    evidence: z.array(EvidenceSchema),
    ...recordFlags,
  })
  .meta({ id: "Issuer" });

export const CanonicalAssetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    claimDescription: z.string(),
    unitDefinition: z.string(),
    denomination: z.string().nullable(),
    economicRights: z.string(),
    legalClaimStructure: z.string(),
    jurisdiction: z.string().nullable(),
    redemptionTerms: z.string(),
    valuationMethod: z.string().nullable(),
    eligibilityRestrictions: z.string(),
    riskDisclosures: z.array(z.string()),
    status: RecordStatusSchema,
    lastReviewedAt: Timestamp.nullable(),
    ...recordFlags,
  })
  .meta({ id: "CanonicalAsset" });

/** List item: representation with the embedded claim name and issuer summary. */
export const AssetSummarySchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    name: z.string(),
    network: NetworkSchema,
    accountId: AccountId,
    decimals: z.number().int().min(0).max(38),
    unitMultiplier: RationalSchema,
    status: RecordStatusSchema,
    canonicalAssetId: z.string(),
    canonicalAssetName: z.string(),
    issuer: IssuerSummarySchema,
    ...recordFlags,
  })
  .meta({ id: "AssetSummary" });

export const AssetSchema = z
  .object({
    id: z.string(),
    canonicalAsset: CanonicalAssetSchema,
    issuer: IssuerSummarySchema,
    network: NetworkSchema,
    accountId: AccountId,
    standard: z.literal("NEP-141"),
    name: z.string(),
    symbol: z.string(),
    decimals: z.number().int().min(0).max(38),
    /** Canonical units per smallest unit. */
    unitMultiplier: RationalSchema,
    adminCapabilities: z.array(z.string()),
    custodyDescription: z.string(),
    redemptionMechanism: z.string(),
    transferPolicySummary: z.string(),
    bridgeStatus: z.enum(["none", "bridged", "wrapped"]),
    allowlistRequired: z.boolean(),
    status: RecordStatusSchema,
    lastReviewedAt: Timestamp.nullable(),
    evidence: z.array(EvidenceSchema),
    /** Vault inventory in smallest units; public because quotes are refused when it is too low. */
    vaultInventory: AmountString,
    ...recordFlags,
  })
  .meta({ id: "Asset" });

export const CompatibilityHistoryEntrySchema = z
  .object({
    version: z.number().int().positive(),
    action: ReviewActionSchema,
    classification: ClassificationSchema,
    status: RelationshipStatusSchema,
    ratio: RationalSchema,
    scope: z.string(),
    rationale: z.string(),
    actor: AccountId,
    at: Timestamp,
  })
  .meta({ id: "CompatibilityHistoryEntry" });

/**
 * A relationship seen from one asset. `ratio` is output smallest units of the counterpart per
 * smallest unit of this asset (already inverted when this asset is the stored "B" side).
 */
export const CompatibilitySchema = z
  .object({
    id: z.string(),
    counterpartId: z.string(),
    classification: ClassificationSchema,
    ratio: RationalSchema,
    scope: z.string(),
    rationale: z.string(),
    version: z.number().int().positive(),
    status: RelationshipStatusSchema,
    /** True only for `DIRECT_EQUIVALENT` + `approved`; the UI uses this to explain eligibility. */
    parityEnabled: z.boolean(),
    proposedBy: AccountId,
    approvedBy: AccountId.nullable(),
    updatedAt: Timestamp,
    evidence: z.array(EvidenceSchema),
    history: z.array(CompatibilityHistoryEntrySchema),
  })
  .meta({ id: "Compatibility" });

export const IndexerHealthSchema = z
  .object({
    state: z
      .enum(["never_run", "running", "lagging", "stale"])
      .describe(
        "`never_run`: no cursor row. `stale`: the last heartbeat is older than the API's INDEXER_STALE_AFTER_MS (stopped or crashed; the two cannot be told apart). `lagging`: heartbeat fresh but more than INDEXER_MAX_LAG_BLOCKS behind the chain. `running`: heartbeat fresh and within the lag limit.",
      ),
    lagBlocks: z.number().int().nonnegative().nullable(),
    lastHeartbeatAt: Timestamp.nullable(),
    heartbeatAgeMs: z.number().int().nonnegative().nullable(),
  })
  .meta({ id: "IndexerHealth" });

export const HealthSchema = z
  .object({
    status: z
      .enum(["ok", "degraded"])
      .describe("`ok` only when the database and RPC answer and the indexer state is `running`."),
    chainHeight: z.number().int().nonnegative().nullable(),
    indexerLagBlocks: z.number().int().nonnegative().nullable(),
    database: z.boolean().describe("The database answered. Required to serve anything."),
    rpc: z.boolean().describe("The chain RPC answered. Required to quote."),
    indexer: IndexerHealthSchema.nullable().describe(
      "`null` when the database is unreachable, so the cursor could not be read.",
    ),
  })
  .meta({ id: "Health" });

export const LivenessSchema = z.object({ status: z.literal("ok") }).meta({ id: "Liveness" });

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Issuer = z.infer<typeof IssuerSchema>;
export type IssuerSummary = z.infer<typeof IssuerSummarySchema>;
export type CanonicalAsset = z.infer<typeof CanonicalAssetSchema>;
export type AssetSummary = z.infer<typeof AssetSummarySchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type Compatibility = z.infer<typeof CompatibilitySchema>;
export type Health = z.infer<typeof HealthSchema>;
export type IndexerHealth = z.infer<typeof IndexerHealthSchema>;
export type Liveness = z.infer<typeof LivenessSchema>;
