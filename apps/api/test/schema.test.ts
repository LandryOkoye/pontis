import { fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assetRepresentations,
  conversions,
  quotes,
  settlementEvents,
} from "../src/db/schema/index.ts";
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

const U128_MAX = (2n ** 128n - 1n).toString();
const quote = (
  nonce: string,
  overrides: Partial<typeof quotes.$inferInsert> = {},
): typeof quotes.$inferInsert => ({
  accountId: "alice.testnet",
  fromId: "tgold-a",
  toId: "tgold-b",
  amountIn: "1000000",
  amountOutGross: "1000000000",
  fee: "1000000",
  amountOut: "999000000",
  ratioNum: "1000",
  ratioDen: "1",
  feeBps: 10,
  nonce,
  signature: "c2ln",
  expiresAt: new Date("2026-11-07T18:01:00Z"),
  compatibilityVersion: 2,
  policyVersion: 1,
  route: {},
  warnings: [],
  state: "QUOTED",
  ...overrides,
});

/** Postgres error code of a rejected statement (Drizzle wraps the driver error as `cause`). */
const pgCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return ((error as { cause?: { code?: string } }).cause ?? (error as { code?: string })).code;
  }
  return undefined;
};

describe("trading schema", () => {
  it("stores u128 amounts exactly in quotes and inventory", async () => {
    const [row] = await t.db
      .insert(quotes)
      .values(quote("a".repeat(32), { amountIn: U128_MAX }))
      .returning();
    expect(row?.amountIn).toBe(U128_MAX);
    await t.db
      .update(assetRepresentations)
      .set({ vaultInventory: U128_MAX })
      .where(eq(assetRepresentations.id, "tgold-a"));
    const [a] = await t.db
      .select()
      .from(assetRepresentations)
      .where(eq(assetRepresentations.id, "tgold-a"));
    expect(a?.vaultInventory).toBe(U128_MAX);
  });

  it("rejects a reused nonce, an unknown representation and a second conversion for one quote", async () => {
    expect(await pgCode(t.db.insert(quotes).values(quote("a".repeat(32))))).toBe("23505");
    expect(await pgCode(t.db.insert(quotes).values(quote("b".repeat(32), { toId: "ghost" })))).toBe(
      "23503",
    );
    const [q] = await t.db
      .insert(quotes)
      .values(quote("c".repeat(32)))
      .returning();
    await t.db.insert(conversions).values({ quoteId: q!.id, idempotencyKey: "key-1" });
    expect(
      await pgCode(t.db.insert(conversions).values({ quoteId: q!.id, idempotencyKey: "key-2" })),
    ).toBe("23505");
  });

  it("makes settlement events unique by receipt and log index", async () => {
    const event = {
      receiptId: "r1",
      logIndex: 0,
      blockHeight: 1,
      blockTimestamp: new Date(),
      txHash: "tx",
      eventName: "conversion_completed",
      data: {},
    };
    await t.db.insert(settlementEvents).values(event);
    expect(await pgCode(t.db.insert(settlementEvents).values(event))).toBe("23505");
    await t.db.insert(settlementEvents).values({ ...event, logIndex: 1 });
  });
});
