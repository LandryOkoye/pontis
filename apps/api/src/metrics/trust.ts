// Trust (spec section 6): the verification column of the registry mirror.

import { assetRepresentations } from "@pontis/db";
import { eq, sql } from "drizzle-orm";
import { big, percent6, type Computed, type MetricsContext } from "./core.ts";

/** Active representations with a third-party or independent verification, as a percentage of the active ones. */
export async function assetsThirdPartyAttestedPct(ctx: MetricsContext): Promise<Computed> {
  const [row] = await ctx.db
    .select({
      attested: sql<string>`(count(*) filter (where ${assetRepresentations.verificationStatus} in ('third_party_attested', 'independently_verified')))::text`,
      active: sql<string>`count(*)::text`,
      synthetic: sql<boolean>`coalesce(bool_or(${assetRepresentations.synthetic}), false)`,
    })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.status, "active"));
  return {
    value: percent6(big(row?.attested), big(row?.active)),
    simulated: row?.synthetic ?? false,
  };
}
