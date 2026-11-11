import { assetProfiles } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLAIMS, REPRESENTATIONS } from "../lib/catalogue.ts";
import { PROFILE_TEXT } from "../lib/catalogue-profiles.ts";
import { REPO_ROOT } from "../lib/evidence.ts";
import { buildProfiles, seedProfiles } from "../lib/seed-profiles.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const rows = buildProfiles("pontis.testnet");

describe("catalogue profiles", () => {
  it("has exactly one profile per representation, and one for every claim", () => {
    expect(rows.map((r) => r.representationId).sort()).toEqual(
      REPRESENTATIONS.map((r) => r.id).sort(),
    );
    expect(Object.keys(PROFILE_TEXT).sort()).toEqual(REPRESENTATIONS.map((r) => r.id).sort());
    for (const claim of CLAIMS) {
      const ids = REPRESENTATIONS.filter((r) => r.claimId === claim.id).map((r) => r.id);
      expect(
        rows.some((r) => ids.includes(r.representationId)),
        claim.id,
      ).toBe(true);
    }
  });

  it("labels every row simulated, and every text as synthetic", () => {
    for (const row of rows) {
      expect([row.source, row.simulated]).toEqual(["simulated_feed", true]);
      expect(row.description).toContain("SYNTHETIC");
      for (const [tab, text] of Object.entries(row.sections ?? {})) {
        expect(text, `${row.representationId} ${tab}`).toContain("SYNTHETIC");
      }
      expect(Object.keys(row.sections ?? {}).sort()).toEqual([
        "custody",
        "legal",
        "overview",
        "risk",
      ]);
      expect(row.tags?.length).toBeGreaterThan(0);
    }
  });

  it("lists NEAR testnet natively and a planned EVM entry only for bridgeable tokens", () => {
    for (const row of rows) {
      const [native, ...rest] = row.chains ?? [];
      expect(native).toEqual({
        chain: "near-testnet",
        contract: `${row.representationId}.pontis.testnet`,
        role: "native",
      });
      expect(rest).toEqual(
        row.bridgeable ? [{ chain: "evm-testnet", contract: null, role: "planned" }] : [],
      );
    }
  });

  it("makes the villa bridge-only: not convertible, bridgeable", () => {
    const villa = rows.find((r) => r.representationId === "tvilla-1");
    expect([villa?.convertible, villa?.bridgeable]).toEqual([false, true]);
  });

  it("points each document at a dossier file with its real hash", () => {
    for (const row of rows) {
      expect(row.documents).toHaveLength(2);
      for (const doc of row.documents ?? []) {
        const hash = createHash("sha256")
          .update(readFileSync(`${REPO_ROOT}/${doc.uri}`))
          .digest("hex");
        expect(doc.sha256).toBe(hash);
        expect(doc.title).toContain("synthetic");
      }
    }
  });
});

describe("seedProfiles", () => {
  let database: TestDb;
  beforeAll(async () => {
    database = await createTestDb();
  });
  afterAll(async () => {
    await database.drop();
  });

  it("writes every row, and writing again changes nothing but the timestamp", async () => {
    expect(await seedProfiles(database.db, rows)).toBe(rows.length);
    const first = await database.db.select().from(assetProfiles);
    expect(first).toHaveLength(rows.length);
    await seedProfiles(database.db, rows);
    const second = await database.db.select().from(assetProfiles);
    const strip = (rs: typeof first) =>
      rs
        .map(({ updatedAt: _ignored, ...rest }) => rest)
        .sort((a, b) => a.representationId.localeCompare(b.representationId));
    expect(strip(second)).toEqual(strip(first));
    expect(first.find((r) => r.representationId === "tvilla-1")).toMatchObject({
      convertible: false,
      bridgeable: true,
      source: "simulated_feed",
      simulated: true,
    });
  });

  it("updates an existing row instead of duplicating it", async () => {
    const [first] = rows;
    if (!first) throw new Error("no rows");
    await seedProfiles(database.db, [{ ...first, description: "SYNTHETIC changed" }]);
    const all = await database.db.select().from(assetProfiles);
    expect(all).toHaveLength(rows.length);
    expect(all.find((r) => r.representationId === first.representationId)?.description).toBe(
      "SYNTHETIC changed",
    );
  });
});
