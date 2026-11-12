import { assetRepresentations, canonicalAssets, issuers, type Db } from "@pontis/db";

const at = new Date("2026-11-01T00:00:00Z");
const flags = { synthetic: true, verificationStatus: "unverified", status: "active" } as const;
const dash = "-";

/** A registry mirror with the given claims and representations `[id, claim, decimals, 1/den]`. */
export async function seedRegistry(
  db: Db,
  reps: readonly [id: string, claim: string, decimals: number, den: string][],
): Promise<void> {
  await db.insert(issuers).values({
    id: "issuer-x",
    name: "Issuer X",
    authorizedCategories: [],
    controlledAccounts: [],
    registeredBy: "owner.test",
    registeredAt: at,
    ...flags,
  });
  for (const claim of new Set(reps.map((r) => r[1]))) {
    await db.insert(canonicalAssets).values({
      id: claim,
      name: claim,
      category: "Test",
      claimDescription: dash,
      unitDefinition: dash,
      economicRights: dash,
      legalClaimStructure: dash,
      redemptionTerms: dash,
      eligibilityRestrictions: dash,
      riskDisclosures: [],
      registeredBy: "owner.test",
      registeredAt: at,
      ...flags,
    });
  }
  for (const [id, claim, decimals, den] of reps) {
    await db.insert(assetRepresentations).values({
      id,
      canonicalAssetId: claim,
      issuerId: "issuer-x",
      accountId: `${id}.test`,
      name: id,
      symbol: id.toUpperCase(),
      decimals,
      unitMultiplierNum: "1",
      unitMultiplierDen: den,
      adminCapabilities: [],
      custodyDescription: dash,
      redemptionMechanism: dash,
      transferPolicySummary: dash,
      bridgeStatus: "none",
      allowlistRequired: false,
      vaultInventory: "0",
      registeredBy: "owner.test",
      registeredAt: at,
      ...flags,
    });
  }
}
