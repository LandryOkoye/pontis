// The asset detail tabs (brief section 12.1, screen 3). Dossier content comes from
// `asset_profiles` and is labelled with its source; registry facts come from the chain mirror, which
// is the authority for the NEAR contract and for evidence provenance.

import type { AssetChain, AssetIssuerView, AssetMetadata } from "@pontis/api-types";
import {
  assetEvidence,
  assetProfiles,
  assetRepresentations,
  canonicalAssets,
  supplySnapshots,
  type Db,
} from "@pontis/db";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { getIssuer } from "../catalog/repository.ts";

export async function representation(db: Db, id: string) {
  const [row] = await db
    .select({ rep: assetRepresentations, claim: canonicalAssets })
    .from(assetRepresentations)
    .innerJoin(canonicalAssets, eq(canonicalAssets.id, assetRepresentations.canonicalAssetId))
    .where(eq(assetRepresentations.id, id));
  return row;
}

const profileOf = async (db: Db, id: string) =>
  (await db.select().from(assetProfiles).where(eq(assetProfiles.representationId, id)))[0];

export async function assetMetadata(db: Db, id: string): Promise<AssetMetadata | undefined> {
  const row = await representation(db, id);
  if (!row) return undefined;
  const p = await profileOf(db, id);
  return {
    id,
    canonicalAssetId: row.claim.id,
    category: row.claim.category,
    profile: p
      ? {
          description: p.description,
          tags: p.tags,
          sections: p.sections,
          convertible: p.convertible,
          bridgeable: p.bridgeable,
          source: p.source,
          simulated: p.simulated,
          updatedAt: p.updatedAt.toISOString(),
        }
      : null,
  };
}

export async function assetIssuerView(db: Db, id: string): Promise<AssetIssuerView | undefined> {
  const row = await representation(db, id);
  if (!row) return undefined;
  const issuer = await getIssuer(db, row.rep.issuerId);
  if (!issuer) return undefined;
  const assets = await db
    .select({
      id: assetRepresentations.id,
      symbol: assetRepresentations.symbol,
      name: assetRepresentations.name,
      status: assetRepresentations.status,
    })
    .from(assetRepresentations)
    .where(eq(assetRepresentations.issuerId, row.rep.issuerId))
    .orderBy(asc(assetRepresentations.id));
  return { issuer, assets };
}

/** The dossier's chains plus the registry's NEAR contract, each with its latest supply snapshot. */
export async function assetChains(db: Db, id: string): Promise<AssetChain[] | undefined> {
  const row = await representation(db, id);
  if (!row) return undefined;
  const profile = await profileOf(db, id);
  const listed = new Map<string, { contract: string | null; role: string }>();
  for (const c of profile?.chains ?? [])
    listed.set(c.chain, { contract: c.contract, role: c.role });
  // The registry, not the dossier, says which account is the token on NEAR.
  listed.set("near-testnet", { contract: row.rep.accountId, role: "native" });

  const snapshots = await db
    .select()
    .from(supplySnapshots)
    .where(eq(supplySnapshots.representationId, id))
    .orderBy(desc(supplySnapshots.ts));
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const held = latest.get(s.chain);
    // Real snapshots win over simulated ones; otherwise the newest.
    if (!held || (held.simulated && !s.simulated)) latest.set(s.chain, s);
  }
  for (const chain of latest.keys())
    if (!listed.has(chain)) listed.set(chain, { contract: null, role: "reported" });
  return [...listed].map(([chain, info]) => {
    const s = latest.get(chain);
    return {
      chain,
      ...info,
      supply: s?.supply ?? null,
      supplyAsOf: s?.ts.toISOString() ?? null,
      simulated: s?.simulated ?? null,
    };
  });
}

export async function assetDocuments(db: Db, id: string) {
  const row = await representation(db, id);
  if (!row) return undefined;
  const profile = await profileOf(db, id);
  const evidence = await db
    .select()
    .from(assetEvidence)
    .where(
      or(
        and(eq(assetEvidence.subjectType, "representation"), eq(assetEvidence.subjectId, id)),
        and(
          eq(assetEvidence.subjectType, "canonical_asset"),
          eq(assetEvidence.subjectId, row.claim.id),
        ),
      ),
    )
    .orderBy(asc(assetEvidence.addedAt), asc(assetEvidence.id));
  return [
    ...(profile?.documents ?? []).map((d) => ({
      title: d.title,
      uri: d.uri,
      sha256: d.sha256,
      origin: "dossier" as const,
      provenance: null,
    })),
    ...evidence.map((e) => ({
      title: e.description,
      uri: e.uri,
      sha256: e.sha256,
      origin: "registry_evidence" as const,
      provenance: e.provenance,
    })),
  ];
}
