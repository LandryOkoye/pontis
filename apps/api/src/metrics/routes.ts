// Route coverage and registry counts (spec section 3): the registry mirror.

import {
  assetProfiles,
  assetRepresentations,
  canonicalAssets,
  compatibilityRelationships,
  issuers,
} from "@pontis/db";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Computed, MetricsContext } from "./core.ts";

/** The chain every MVP representation lives on (`standard = 'NEP-141'`); matches the profile chain IDs. */
export const NEAR_CHAIN = "near-testnet";

/** Per spec: `DIRECT_EQUIVALENT`, `approved`, both representations `active`. The chain's pause state is not mirrored, so it is not consulted. */
export async function directEquivalentRoutesLive(ctx: MetricsContext): Promise<Computed> {
  const a = alias(assetRepresentations, "rep_a");
  const b = alias(assetRepresentations, "rep_b");
  const [row] = await ctx.db
    .select({
      n: sql<string>`count(*)::text`,
      synthetic: sql<boolean>`coalesce(bool_or(${a.synthetic} or ${b.synthetic}), false)`,
    })
    .from(compatibilityRelationships)
    .innerJoin(a, eq(a.id, compatibilityRelationships.representationAId))
    .innerJoin(b, eq(b.id, compatibilityRelationships.representationBId))
    .where(
      and(
        eq(compatibilityRelationships.classification, "DIRECT_EQUIVALENT"),
        eq(compatibilityRelationships.status, "approved"),
        eq(a.status, "active"),
        eq(b.status, "active"),
      ),
    );
  return { value: Number(row?.n ?? 0), simulated: row?.synthetic ?? false };
}

export async function assetsRegistered(ctx: MetricsContext): Promise<Computed> {
  const [row] = await ctx.db
    .select({
      n: sql<string>`count(*)::text`,
      synthetic: sql<boolean>`coalesce(bool_or(${canonicalAssets.synthetic}), false)`,
    })
    .from(canonicalAssets);
  return { value: Number(row?.n ?? 0), simulated: row?.synthetic ?? false };
}

async function activeRepresentations(ctx: MetricsContext) {
  const [row] = await ctx.db
    .select({
      n: sql<string>`count(*)::text`,
      issuers: sql<string>`count(distinct ${assetRepresentations.issuerId})::text`,
      synthetic: sql<boolean>`coalesce(bool_or(${assetRepresentations.synthetic}), false)`,
    })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.status, "active"));
  return row;
}

export async function representationsActive(ctx: MetricsContext): Promise<Computed> {
  const row = await activeRepresentations(ctx);
  return { value: Number(row?.n ?? 0), simulated: row?.synthetic ?? false };
}

export async function issuersActive(ctx: MetricsContext): Promise<Computed> {
  const row = await activeRepresentations(ctx);
  // The issuer's own `synthetic` flag decides, not the token's.
  const [flag] = await ctx.db
    .select({ synthetic: sql<boolean>`coalesce(bool_or(${issuers.synthetic}), false)` })
    .from(issuers)
    .innerJoin(assetRepresentations, eq(assetRepresentations.issuerId, issuers.id))
    .where(eq(assetRepresentations.status, "active"));
  return { value: Number(row?.issuers ?? 0), simulated: flag?.synthetic ?? false };
}

/**
 * Distinct chains with an active representation: NEAR (the registry's constant 1, present when any
 * representation is active) plus every non-`planned` chain listed in the off-chain profiles of
 * active representations.
 */
export async function chainsLive(ctx: MetricsContext): Promise<Computed> {
  const active = await activeRepresentations(ctx);
  const profiles = await ctx.db
    .select({ chains: assetProfiles.chains })
    .from(assetProfiles)
    .innerJoin(assetRepresentations, eq(assetRepresentations.id, assetProfiles.representationId))
    .where(eq(assetRepresentations.status, "active"));
  const live = new Set<string>(Number(active?.n ?? 0) > 0 ? [NEAR_CHAIN] : []);
  for (const p of profiles) for (const c of p.chains) if (c.role !== "planned") live.add(c.chain);
  return { value: live.size, simulated: active?.synthetic ?? false };
}
