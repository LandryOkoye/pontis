// Rebuilds `asset_search` (ADR 0015 section 3): one lower-cased document per representation.

import {
  assetProfiles,
  assetRepresentations,
  assetSearch,
  canonicalAssets,
  issuers,
  type Db,
} from "@pontis/db";
import { eq, notInArray } from "drizzle-orm";

export async function refreshSearchIndex(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({
      id: assetRepresentations.id,
      symbol: assetRepresentations.symbol,
      name: assetRepresentations.name,
      claim: canonicalAssets.name,
      category: canonicalAssets.category,
      issuer: issuers.name,
      tags: assetProfiles.tags,
    })
    .from(assetRepresentations)
    .innerJoin(canonicalAssets, eq(canonicalAssets.id, assetRepresentations.canonicalAssetId))
    .innerJoin(issuers, eq(issuers.id, assetRepresentations.issuerId))
    .leftJoin(assetProfiles, eq(assetProfiles.representationId, assetRepresentations.id));
  const documents = rows.map((r) => ({
    representationId: r.id,
    document: [r.symbol, r.name, r.claim, r.category, r.issuer, ...(r.tags ?? [])]
      .join(" ")
      .toLowerCase(),
    updatedAt: now,
  }));
  await db.transaction(async (tx) => {
    const ids = documents.map((d) => d.representationId);
    await tx
      .delete(assetSearch)
      .where(ids.length > 0 ? notInArray(assetSearch.representationId, ids) : undefined);
    for (const doc of documents) {
      await tx
        .insert(assetSearch)
        .values(doc)
        .onConflictDoUpdate({ target: assetSearch.representationId, set: doc });
    }
  });
  return documents.length;
}
