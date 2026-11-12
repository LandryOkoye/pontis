// Search across assets, issuers and chains (`GET /v1/search`). Every word must match.

import type { SearchResult } from "@pontis/api-types";
import {
  assetProfiles,
  assetRepresentations,
  assetSearch,
  canonicalAssets,
  issuers,
  type Db,
} from "@pontis/db";
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { issuerSummary } from "../catalog/mappers.ts";

const escapeLike = (token: string) => token.replace(/[\\%_]/g, "\\$&");

export async function search(db: Db, q: string): Promise<SearchResult> {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = await db
    .select({ id: assetSearch.representationId })
    .from(assetSearch)
    .where(and(...tokens.map((t) => ilike(assetSearch.document, `%${escapeLike(t)}%`))));
  const rows = hits.length
    ? await db
        .select({ rep: assetRepresentations, claim: canonicalAssets, issuer: issuers })
        .from(assetRepresentations)
        .innerJoin(canonicalAssets, eq(canonicalAssets.id, assetRepresentations.canonicalAssetId))
        .innerJoin(issuers, eq(issuers.id, assetRepresentations.issuerId))
        .where(
          inArray(
            assetRepresentations.id,
            hits.map((h) => h.id),
          ),
        )
    : [];
  const needle = q.toLowerCase().trim();
  const rank = (symbol: string) =>
    symbol.toLowerCase() === needle ? 0 : symbol.toLowerCase().startsWith(needle) ? 1 : 2;
  const assets = rows
    .sort((a, b) => rank(a.rep.symbol) - rank(b.rep.symbol) || a.rep.id.localeCompare(b.rep.id))
    .slice(0, 10)
    .map((r) => ({
      id: r.rep.id,
      symbol: r.rep.symbol,
      name: r.rep.name,
      canonicalAssetName: r.claim.name,
      issuer: issuerSummary(r.issuer),
    }));

  const matchingIssuers = await db
    .select()
    .from(issuers)
    .where(
      and(
        ...tokens.map((t) =>
          or(ilike(issuers.name, `%${escapeLike(t)}%`), ilike(issuers.id, `%${escapeLike(t)}%`)),
        ),
      ),
    )
    .orderBy(asc(issuers.id))
    .limit(5);

  // Chains: every chain named in a dossier, plus NEAR for every registered asset.
  const reps = await db.select({ id: assetRepresentations.id }).from(assetRepresentations);
  const counts = new Map<string, Set<string>>([["near-testnet", new Set(reps.map((r) => r.id))]]);
  for (const p of await db.select().from(assetProfiles)) {
    for (const c of p.chains)
      counts.set(c.chain, (counts.get(c.chain) ?? new Set()).add(p.representationId));
  }
  const chains = [...counts]
    .filter(([chain]) => tokens.every((t) => chain.toLowerCase().includes(t)))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 5)
    .map(([chain, ids]) => ({ chain, assetCount: ids.size }));

  return { q, assets, issuers: matchingIssuers.map(issuerSummary), chains };
}
