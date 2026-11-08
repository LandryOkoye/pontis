import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { fixtureSource, compatibilities, inventories } from "@pontis/near-client/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assetEvidence,
  assetRepresentations,
  compatibilityRelationships,
  compatibilityReviews,
  issuers,
  transferPolicies,
} from "../src/db/schema/index.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "./db.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});

const rows = async (table: PgTable) => (await t.db.select({ n: count() }).from(table))[0]?.n ?? 0;

describe("syncRegistry", () => {
  it("mirrors the MVP seed into every registry table", async () => {
    const summary = await syncRegistry(t.db, fixtureSource());
    expect(summary).toMatchObject({
      issuers: 2,
      canonicalAssets: 1,
      representations: 2,
      compatibilities: 1,
      evidence: 6,
    });
    expect(await rows(issuers)).toBe(2);
    expect(await rows(assetRepresentations)).toBe(2);
    expect(await rows(compatibilityReviews)).toBe(2);
    expect(await rows(transferPolicies)).toBe(2);
    expect(await rows(assetEvidence)).toBe(6);
  });

  it("is idempotent: a second run changes no row count", async () => {
    await syncRegistry(t.db, fixtureSource());
    expect(await rows(issuers)).toBe(2);
    expect(await rows(compatibilityReviews)).toBe(2);
    expect(await rows(assetEvidence)).toBe(6);
  });

  it("applies chain changes: suspension, inventory and policy", async () => {
    const suspended = compatibilities.map((c) => ({
      ...c,
      status: "suspended" as const,
      classification: "SUSPENDED" as const,
      version: 3,
    }));
    await syncRegistry(
      t.db,
      fixtureSource({
        listCompatibilities: async () => suspended,
        getInventory: async (id) => (id === "tgold-b" ? "1" : (inventories[id] ?? "0")),
        getPolicy: async (id) => ({
          representation_id: id,
          allowlist_required: false,
          policy_version: 2,
        }),
      }),
    );
    const [rel] = await t.db.select().from(compatibilityRelationships);
    expect([rel?.status, rel?.classification, rel?.version]).toEqual(["suspended", "SUSPENDED", 3]);
    const [b] = await t.db
      .select()
      .from(assetRepresentations)
      .where(eq(assetRepresentations.id, "tgold-b"));
    expect([b?.vaultInventory, b?.allowlistRequired]).toEqual(["1", false]);
  });

  it("leaves the mirror untouched when a chain read fails", async () => {
    const before = await rows(assetEvidence);
    await expect(
      syncRegistry(
        t.db,
        fixtureSource({ listCompatibilities: async () => Promise.reject(new Error("rpc down")) }),
      ),
    ).rejects.toThrow("rpc down");
    expect(await rows(assetEvidence)).toBe(before);
  });
});
