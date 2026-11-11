// Builds and upserts the off-chain `asset_profiles` rows of the demo catalogue (ADR 0015
// section 3). Rows are keyed by representation id, so running it again rewrites the same rows.
// Every row is labelled `source: "simulated_feed"`, `simulated: true`; none marks anything verified.

import { assetProfiles, type Db } from "@pontis/db";
import { sql } from "drizzle-orm";
import { CLAIMS, ISSUERS, REPRESENTATIONS, tokenAccount } from "./catalogue.ts";
import { PROFILE_TEXT } from "./catalogue-profiles.ts";
import { dossierEvidence, REPO_ROOT } from "./evidence.ts";

export type ProfileRow = typeof assetProfiles.$inferInsert;

/** The chain name the simulator and the registry mirror use for NEAR Testnet. */
export const NEAR_CHAIN = "near-testnet";
/** A bridge to an EVM chain is planned (ADR 0014 workstream F); none exists, so no contract. */
export const PLANNED_EVM_CHAIN = "evm-testnet";

export function buildProfiles(deployerId: string, root: string = REPO_ROOT): ProfileRow[] {
  return REPRESENTATIONS.map((rep) => {
    const text = PROFILE_TEXT[rep.id];
    const claim = CLAIMS.find((c) => c.id === rep.claimId);
    const issuer = ISSUERS.find((i) => i.id === rep.issuerId);
    if (!text || !claim || !issuer)
      throw new Error(`no profile text, claim or issuer for ${rep.id}`);
    const document = (title: string, dossier: string) => {
      const { uri, sha256 } = dossierEvidence(dossier, root);
      return { title, uri, sha256 };
    };
    return {
      representationId: rep.id,
      description: text.description,
      tags: [...text.tags],
      chains: [
        { chain: NEAR_CHAIN, contract: tokenAccount(rep.id, deployerId), role: "native" },
        ...(rep.bridgeable ? [{ chain: PLANNED_EVM_CHAIN, contract: null, role: "planned" }] : []),
      ],
      documents: [
        document(`Claim dossier: ${claim.id} (synthetic, self-attested)`, claim.dossier),
        document(`Issuer dossier: ${issuer.id} (synthetic, self-attested)`, issuer.dossier),
      ],
      sections: { ...text.sections },
      convertible: rep.convertible,
      bridgeable: rep.bridgeable,
      source: "simulated_feed",
      simulated: true,
    };
  });
}

/** Inserts or updates one row per catalogue representation; returns how many were written. */
export async function seedProfiles(db: Db, rows: ProfileRow[]): Promise<number> {
  await db
    .insert(assetProfiles)
    .values(rows)
    .onConflictDoUpdate({
      target: assetProfiles.representationId,
      set: {
        description: sql`excluded.description`,
        tags: sql`excluded.tags`,
        chains: sql`excluded.chains`,
        documents: sql`excluded.documents`,
        sections: sql`excluded.sections`,
        convertible: sql`excluded.convertible`,
        bridgeable: sql`excluded.bridgeable`,
        source: sql`excluded.source`,
        simulated: sql`excluded.simulated`,
        updatedAt: new Date(),
      },
    });
  return rows.length;
}
