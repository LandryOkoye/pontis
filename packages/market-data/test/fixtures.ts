import { assetRepresentations, canonicalAssets, issuers, type Db } from "@pontis/db";

const dash = "-";
const now = new Date("2026-11-01T00:00:00Z");
const flags = { synthetic: true, verificationStatus: "unverified", status: "active" } as const;

/** One issuer, one claim and the given representations (smallest-unit decimals per ID). */
export async function seedRegistry(db: Db, reps: Record<string, number>): Promise<void> {
  await db.insert(issuers).values({
    id: "issuer-x",
    name: "Issuer X",
    authorizedCategories: [],
    controlledAccounts: [],
    registeredBy: "owner.test",
    registeredAt: now,
    ...flags,
  });
  await db.insert(canonicalAssets).values({
    id: "claim-x",
    name: "Claim X",
    category: "Test",
    claimDescription: dash,
    unitDefinition: dash,
    economicRights: dash,
    legalClaimStructure: dash,
    redemptionTerms: dash,
    eligibilityRestrictions: dash,
    riskDisclosures: [],
    registeredBy: "owner.test",
    registeredAt: now,
    ...flags,
  });
  for (const [id, decimals] of Object.entries(reps)) {
    await db.insert(assetRepresentations).values({
      id,
      canonicalAssetId: "claim-x",
      issuerId: "issuer-x",
      accountId: `${id}.test`,
      name: id.toUpperCase(),
      symbol: id.toUpperCase(),
      decimals,
      unitMultiplierNum: "1",
      unitMultiplierDen: "1000000",
      adminCapabilities: [],
      custodyDescription: dash,
      redemptionMechanism: dash,
      transferPolicySummary: dash,
      bridgeStatus: "none",
      allowlistRequired: false,
      vaultInventory: "0",
      registeredBy: "owner.test",
      registeredAt: now,
      ...flags,
    });
  }
}
