// The asset detail tabs (brief section 12.1, screen 3): dossier metadata, issuer, where the asset
// exists, documents and activity. Dossier content is off-chain and never marks anything verified
// (ADR 0009); activity rows carry `source` and `simulated` like every market figure.

import { EVIDENCE_PROVENANCES } from "@pontis/domain";
import { z } from "zod";
import { AccountId, AmountString, Timestamp } from "./common.ts";
import { DataFilterSchema, DataSourceSchema } from "./market-types.ts";
import { IssuerSchema } from "./registry-types.ts";

export const AssetProfileSchema = z
  .object({
    description: z.string(),
    tags: z.array(z.string()),
    /** Dossier sections keyed by tab: for example overview, legal, custody, risk. */
    sections: z.record(z.string(), z.string()),
    convertible: z.boolean(),
    bridgeable: z.boolean(),
    source: DataSourceSchema,
    simulated: z.boolean(),
    updatedAt: Timestamp,
  })
  .meta({ id: "AssetProfile" });

export const AssetMetadataSchema = z
  .object({
    id: z.string(),
    canonicalAssetId: z.string(),
    category: z.string(),
    /** Null when no dossier has been loaded for this asset. */
    profile: AssetProfileSchema.nullable(),
  })
  .meta({ id: "AssetMetadata" });

export const AssetIssuerViewSchema = z
  .object({
    issuer: IssuerSchema,
    assets: z.array(
      z.object({ id: z.string(), symbol: z.string(), name: z.string(), status: z.string() }),
    ),
  })
  .meta({ id: "AssetIssuerView" });

export const AssetChainSchema = z
  .object({
    chain: z.string(),
    contract: z.string().nullable(),
    /** `native`, `wrapped`, `planned`: the dossier's word; the registry is the authority for NEAR. */
    role: z.string(),
    /** Smallest units; null when no snapshot exists. */
    supply: AmountString.nullable(),
    supplyAsOf: Timestamp.nullable(),
    simulated: z.boolean().nullable(),
  })
  .meta({ id: "AssetChain" });
export const AssetChainListSchema = z
  .object({ items: z.array(AssetChainSchema) })
  .meta({ id: "AssetChainList" });

export const AssetDocumentSchema = z
  .object({
    title: z.string(),
    uri: z.string(),
    sha256: z.string().nullable(),
    origin: z.enum(["dossier", "registry_evidence"]),
    /** Registry evidence only: who produced it. Never inferred for dossier documents. */
    provenance: z.enum(EVIDENCE_PROVENANCES).nullable(),
  })
  .meta({ id: "AssetDocument" });
export const AssetDocumentListSchema = z
  .object({ items: z.array(AssetDocumentSchema) })
  .meta({ id: "AssetDocumentList" });

export const ActivityQuerySchema = z.object({
  data: DataFilterSchema.default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});

export const ActivityItemSchema = z
  .object({
    kind: z.literal("conversion"),
    at: Timestamp,
    accountId: AccountId,
    fromId: z.string(),
    toId: z.string(),
    amountIn: AmountString,
    amountOut: AmountString,
    fee: AmountString,
    source: DataSourceSchema,
    simulated: z.boolean(),
  })
  .meta({ id: "ActivityItem" });
export const ActivityListSchema = z
  .object({ items: z.array(ActivityItemSchema), nextCursor: z.string().nullable() })
  .meta({ id: "ActivityList" });

export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;
export type AssetChain = z.infer<typeof AssetChainSchema>;
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type AssetIssuerView = z.infer<typeof AssetIssuerViewSchema>;
