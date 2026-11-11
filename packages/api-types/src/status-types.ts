// Issuer leaderboard and the status page feed (brief section 12.1, screens 7 and 9).

import { z } from "zod";
import { Timestamp } from "./common.ts";
import { DataFilterSchema, PriceString } from "./market-types.ts";
import { HealthSchema, IssuerSummarySchema } from "./registry-types.ts";

export const LeaderboardQuerySchema = z.object({ data: DataFilterSchema.default("all") });

export const IssuerLeaderboardSchema = z
  .object({
    data: DataFilterSchema,
    items: z.array(
      z.object({
        rank: z.number().int().positive(),
        issuer: IssuerSummarySchema,
        assetCount: z.number().int().min(0),
        totalMarketCap: PriceString.nullable(),
        simulated: z.boolean().nullable(),
        /** Null until redemption SLA and reserve data exist (phase 4); never a made-up score. */
        reliabilityScore: z.number().int().min(0).max(100).nullable(),
      }),
    ),
  })
  .meta({ id: "IssuerLeaderboard" });

const freshness = z.object({
  latestAt: Timestamp.nullable(),
  ageSeconds: z.number().int().nonnegative().nullable(),
  stale: z.boolean(),
});

export const StatusSchema = z
  .object({
    asOf: Timestamp,
    health: HealthSchema,
    /** Newest price point of any representation, per data class. */
    prices: z.object({ real: freshness, simulated: freshness }),
    /** Last refresh of the market stats job. */
    marketJobs: freshness,
    routes: z.object({
      approved: z.number().int().min(0),
      suspended: z.number().int().min(0),
      proposed: z.number().int().min(0),
    }),
    /** Not available yet: reserve attestations and bridge invariants arrive in later phases. */
    reserves: z.null(),
    bridge: z.null(),
    incidents: z.array(z.object({ at: Timestamp, summary: z.string() })),
  })
  .meta({ id: "Status" });

export type IssuerLeaderboard = z.infer<typeof IssuerLeaderboardSchema>;
export type Status = z.infer<typeof StatusSchema>;
