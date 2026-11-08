// Chain to DB (B9): read all from the chain, then replace the mirror in one transaction. Idempotent.

import type { RegistrySource } from "@pontis/near-client";
import type { Db } from "../db/client.ts";
import {
  assetEvidence,
  assetRepresentations,
  canonicalAssets,
  compatibilityRelationships,
  compatibilityReviews,
  issuers,
  transferPolicies,
} from "../db/schema/index.ts";
import {
  claimRow,
  evidenceRow,
  issuerRow,
  relationshipRow,
  representationRow,
  reviewRow,
} from "./registry-rows.ts";

export interface SyncSummary {
  blockHeight: number;
  issuers: number;
  canonicalAssets: number;
  representations: number;
  compatibilities: number;
  evidence: number;
}

export async function syncRegistry(db: Db, source: RegistrySource): Promise<SyncSummary> {
  const [blockHeight, chainIssuers, claims, reps, relationships] = await Promise.all([
    source.blockHeight(),
    source.listIssuers(),
    source.listCanonicalAssets(),
    source.listRepresentations(),
    source.listCompatibilities(),
  ]);
  const perRep = await Promise.all(
    reps.map(async (r) => ({
      rep: r,
      policy: await source.getPolicy(r.id),
      inventory: await source.getInventory(r.id),
    })),
  );
  const evidence = [
    ...chainIssuers.flatMap((i) => i.evidence.map((e) => evidenceRow("issuer", i.id, e))),
    ...claims.flatMap((c) => c.evidence.map((e) => evidenceRow("canonical_asset", c.id, e))),
    ...reps.flatMap((r) => r.evidence.map((e) => evidenceRow("representation", r.id, e))),
    ...relationships.flatMap((c) => c.evidence.map((e) => evidenceRow("compatibility", c.id, e))),
  ];

  await db.transaction(async (tx) => {
    for (const row of chainIssuers.map(issuerRow)) {
      await tx.insert(issuers).values(row).onConflictDoUpdate({ target: issuers.id, set: row });
    }
    for (const row of claims.map(claimRow)) {
      await tx
        .insert(canonicalAssets)
        .values(row)
        .onConflictDoUpdate({ target: canonicalAssets.id, set: row });
    }
    for (const { rep, policy, inventory } of perRep) {
      const row = representationRow(rep, policy, inventory);
      await tx
        .insert(assetRepresentations)
        .values(row)
        .onConflictDoUpdate({ target: assetRepresentations.id, set: row });
      if (policy) {
        const p = {
          representationId: rep.id,
          allowlistRequired: policy.allowlist_required,
          policyVersion: policy.policy_version,
          updatedAt: new Date(),
        };
        await tx
          .insert(transferPolicies)
          .values(p)
          .onConflictDoUpdate({ target: transferPolicies.representationId, set: p });
      }
    }
    for (const c of relationships) {
      const row = relationshipRow(c);
      await tx
        .insert(compatibilityRelationships)
        .values(row)
        .onConflictDoUpdate({ target: compatibilityRelationships.id, set: row });
      for (const h of c.history)
        await tx.insert(compatibilityReviews).values(reviewRow(c.id, h)).onConflictDoNothing();
    }
    await tx.delete(assetEvidence);
    if (evidence.length > 0) await tx.insert(assetEvidence).values(evidence);
  });

  return {
    blockHeight,
    issuers: chainIssuers.length,
    canonicalAssets: claims.length,
    representations: reps.length,
    compatibilities: relationships.length,
    evidence: evidence.length,
  };
}
