// Catalog reads: Postgres rows to the API shapes. `undefined` means "no such record" (404).

import type { Asset, Compatibility, Issuer, IssuerSummary } from "@pontis/api-types";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@pontis/db";
import {
  assetEvidence,
  assetRepresentations,
  canonicalAssets,
  compatibilityRelationships,
  compatibilityReviews,
  issuers,
} from "@pontis/db";
import { asset } from "./asset-mappers.ts";
import { compatibility } from "./compat-mapper.ts";
import { issuer, issuerSummary } from "./mappers.ts";

type EvidenceSubject = typeof assetEvidence.$inferSelect.subjectType;

const evidenceFor = (db: Db, subjectType: EvidenceSubject, subjectIds: string[]) =>
  db
    .select()
    .from(assetEvidence)
    .where(
      and(eq(assetEvidence.subjectType, subjectType), inArray(assetEvidence.subjectId, subjectIds)),
    )
    .orderBy(asc(assetEvidence.addedAt), asc(assetEvidence.id));

export async function listIssuers(db: Db): Promise<IssuerSummary[]> {
  return (await db.select().from(issuers).orderBy(asc(issuers.id))).map(issuerSummary);
}

export async function getIssuer(db: Db, id: string): Promise<Issuer | undefined> {
  const [row] = await db.select().from(issuers).where(eq(issuers.id, id));
  return row ? issuer(row, await evidenceFor(db, "issuer", [id])) : undefined;
}

export async function getAsset(db: Db, id: string): Promise<Asset | undefined> {
  const [row] = await db
    .select({ rep: assetRepresentations, claim: canonicalAssets, issuer: issuers })
    .from(assetRepresentations)
    .innerJoin(canonicalAssets, eq(canonicalAssets.id, assetRepresentations.canonicalAssetId))
    .innerJoin(issuers, eq(issuers.id, assetRepresentations.issuerId))
    .where(eq(assetRepresentations.id, id));
  return row
    ? asset(row.rep, row.claim, row.issuer, await evidenceFor(db, "representation", [id]))
    : undefined;
}

/** Relationships involving the asset, each from the asset's point of view; `undefined` if no such asset. */
export async function getAssetCompatibility(
  db: Db,
  id: string,
): Promise<Compatibility[] | undefined> {
  const [rep] = await db
    .select({ id: assetRepresentations.id })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.id, id));
  if (!rep) return undefined;
  const rels = await db
    .select()
    .from(compatibilityRelationships)
    .where(
      or(
        eq(compatibilityRelationships.representationAId, id),
        eq(compatibilityRelationships.representationBId, id),
      ),
    )
    .orderBy(asc(compatibilityRelationships.id));
  if (rels.length === 0) return [];
  const ids = rels.map((r) => r.id);
  const [reviews, evidence] = await Promise.all([
    db
      .select()
      .from(compatibilityReviews)
      .where(inArray(compatibilityReviews.relationshipId, ids))
      .orderBy(asc(compatibilityReviews.version)),
    evidenceFor(db, "compatibility", ids),
  ]);
  return rels.map((rel) =>
    compatibility(
      id,
      rel,
      reviews.filter((h) => h.relationshipId === rel.id),
      evidence.filter((e) => e.subjectId === rel.id),
    ),
  );
}
