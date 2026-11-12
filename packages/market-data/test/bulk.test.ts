import { pricePoints } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulkInsert, type BulkColumn } from "../src/index.ts";

const COLUMNS: readonly BulkColumn[] = [
  { name: "representation_id", type: "text" },
  { name: "ts", type: "timestamptz" },
  { name: "price", type: "numeric" },
  { name: "currency", type: "text" },
  { name: "source", type: "text" },
  { name: "simulated", type: "boolean" },
  { name: "attestation", type: "jsonb" },
];
const row = (n: number) => ({
  representation_id: "x",
  ts: new Date(Date.UTC(2026, 10, 1, 0, n * 5)),
  price: `${n}.12345678`,
  currency: "USD",
  source: "simulated_feed",
  simulated: true,
  attestation: { domain: "d", version: 1, signature: "s" },
});

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});

describe("bulkInsert", () => {
  it("writes typed rows, counts only new ones and skips duplicates", async () => {
    const skip = sql`ON CONFLICT DO NOTHING`;
    expect(await bulkInsert(t.db, "price_points", COLUMNS, [row(1), row(2)], skip)).toBe(2);
    expect(await bulkInsert(t.db, "price_points", COLUMNS, [row(2), row(3)], skip)).toBe(1);
    expect(await bulkInsert(t.db, "price_points", COLUMNS, [], skip)).toBe(0);
    const stored = await t.db.select().from(pricePoints).orderBy(pricePoints.ts);
    expect(stored.map((r) => r.price)).toEqual(["1.12345678", "2.12345678", "3.12345678"]);
    expect(stored[0]?.ts.toISOString()).toBe("2026-11-01T00:05:00.000Z");
    expect(stored[0]?.attestation).toEqual({ domain: "d", version: 1, signature: "s" });
    expect(stored.every((r) => r.simulated)).toBe(true);
  });
});
