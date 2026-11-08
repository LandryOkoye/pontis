import {
  AssetSchema,
  AssetSummarySchema,
  CompatibilitySchema,
  IssuerSchema,
  IssuerSummarySchema,
} from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAsset,
  getAssetCompatibility,
  getIssuer,
  listAssets,
  listIssuers,
} from "../src/catalog/repository.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "./db.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

describe("catalog repository", () => {
  it("lists issuers and fetches one with its evidence, matching the API schemas", async () => {
    const list = await listIssuers(t.db);
    expect(list.map((i) => i.id)).toEqual(["synthetic-issuer-a", "synthetic-issuer-b"]);
    list.forEach((i) => IssuerSummarySchema.parse(i));
    const one = IssuerSchema.parse(await getIssuer(t.db, "synthetic-issuer-a"));
    expect(one.evidence).toHaveLength(1);
    expect(one.evidence[0]).toMatchObject({ provenance: "issuer_provided", subjectType: "issuer" });
    expect([one.synthetic, one.verificationStatus]).toEqual([true, "unverified"]);
    expect(await getIssuer(t.db, "ghost")).toBeUndefined();
  });

  it("lists assets with the embedded claim name and issuer, and details with exact amounts", async () => {
    const list = await listAssets(t.db);
    list.forEach((a) => AssetSummarySchema.parse(a));
    expect(list.map((a) => [a.id, a.decimals, a.canonicalAssetName])).toEqual([
      ["tgold-a", 6, "Synthetic Gold, one troy ounce"],
      ["tgold-b", 8, "Synthetic Gold, one troy ounce"],
    ]);
    const b = AssetSchema.parse(await getAsset(t.db, "tgold-b"));
    expect(b.unitMultiplier).toEqual({ num: "1", den: "1000000000" });
    expect(b.vaultInventory).toBe("1000000000000");
    expect(b.canonicalAsset.id).toBe("syn-gold-oz");
    expect(await getAsset(t.db, "ghost")).toBeUndefined();
  });

  it("returns each relationship from the asset's side, inverting the ratio for B", async () => {
    const fromA = (await getAssetCompatibility(t.db, "tgold-a"))?.map((c) =>
      CompatibilitySchema.parse(c),
    );
    const fromB = (await getAssetCompatibility(t.db, "tgold-b"))?.map((c) =>
      CompatibilitySchema.parse(c),
    );
    expect(fromA?.[0]).toMatchObject({
      counterpartId: "tgold-b",
      ratio: { num: "1000", den: "1" },
      parityEnabled: true,
      version: 2,
    });
    expect(fromB?.[0]).toMatchObject({
      counterpartId: "tgold-a",
      ratio: { num: "1", den: "1000" },
      parityEnabled: true,
    });
    expect(fromB?.[0]?.history.map((h) => [h.version, h.action, h.ratio])).toEqual([
      [1, "proposed", { num: "1", den: "1000" }],
      [2, "approved", { num: "1", den: "1000" }],
    ]);
    expect(fromA?.[0]?.evidence).toHaveLength(1);
  });

  it("returns undefined for the compatibility of an unknown asset", async () => {
    expect(await getAssetCompatibility(t.db, "ghost")).toBeUndefined();
  });
});
