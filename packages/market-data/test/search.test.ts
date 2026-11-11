import { assetSearch } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { refreshSearchIndex } from "../src/index.ts";
import { seedRegistry } from "./fixtures.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await seedRegistry(t.db, { aaa: 6, bbb: 6 });
});
afterAll(async () => {
  await t.drop();
});

describe("refreshSearchIndex", () => {
  it("indexes symbol, claim, issuer and category in lower case", async () => {
    expect(await refreshSearchIndex(t.db)).toBe(2);
    const [doc] = await t.db
      .select()
      .from(assetSearch)
      .where(eq(assetSearch.representationId, "aaa"));
    expect(doc?.document).toBe("aaa aaa claim x test issuer x");
  });
});
