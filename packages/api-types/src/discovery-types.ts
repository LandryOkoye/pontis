// Discovery reads (brief section 12.1, screens 4, 7 and 9): compare representations, search,
// issuer leaderboard and the status page feed. Same honesty rule as every market figure.

import { z } from "zod";
import { RecordStatusSchema, VerificationStatusSchema } from "./common.ts";
import { DataFilterSchema, MarketSnapshotSchema, PriceString } from "./market-types.ts";
import { IssuerSummarySchema } from "./registry-types.ts";

export const CompareQuerySchema = z.object({
  ids: z
    .string()
    .regex(/^[a-z0-9-]+(,[a-z0-9-]+){1,5}$/, "two to six asset IDs separated by commas"),
  data: DataFilterSchema.default("all"),
});

export const CompareItemSchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    name: z.string(),
    canonicalAssetId: z.string(),
    issuer: IssuerSummarySchema,
    status: RecordStatusSchema,
    verificationStatus: VerificationStatusSchema,
    chains: z.array(z.string()),
    convertible: z.boolean(),
    bridgeable: z.boolean(),
    market: MarketSnapshotSchema.nullable(),
    /** Latest NAV per token from the same data class as `market`; null when the asset has none. */
    navPerToken: PriceString.nullable(),
    /** (price - NAV) / NAV in basis points, truncated toward zero; null without both. */
    premiumToNavBps: z.number().int().nullable(),
  })
  .meta({ id: "CompareItem" });

export const ParityPairSchema = z
  .object({
    fromId: z.string(),
    toId: z.string(),
    /** `to` tokens one `from` token is worth by the registry's unit definitions. */
    parityRatio: PriceString,
    /** Market price of `from` over market price of `to`; null when either has no price. */
    impliedRatio: PriceString.nullable(),
    /** (implied - parity) / parity in basis points, truncated toward zero. */
    deviationBps: z.number().int().nullable(),
    simulated: z.boolean().nullable(),
  })
  .meta({ id: "ParityPair" });

export const CompareResponseSchema = z
  .object({
    data: DataFilterSchema,
    items: z.array(CompareItemSchema),
    /** Every ordered pair of compared assets that share a canonical claim. */
    pairs: z.array(ParityPairSchema),
  })
  .meta({ id: "CompareResponse" });

export const SearchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

export const SearchResultSchema = z
  .object({
    q: z.string(),
    assets: z.array(
      z.object({
        id: z.string(),
        symbol: z.string(),
        name: z.string(),
        canonicalAssetName: z.string(),
        issuer: IssuerSummarySchema,
      }),
    ),
    issuers: z.array(IssuerSummarySchema),
    chains: z.array(z.object({ chain: z.string(), assetCount: z.number().int().min(0) })),
  })
  .meta({ id: "SearchResult" });

export type CompareResponse = z.infer<typeof CompareResponseSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
