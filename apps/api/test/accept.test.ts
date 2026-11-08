import { fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote, type AcceptDeps } from "../src/conversions/accept.ts";
import { conversions, quotes } from "../src/db/schema/index.ts";
import { createQuote } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "./db.ts";
import { errorCodeOf, testAppDeps } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-11-07T18:00:00Z");
let registered = true;
const accept = (over: Partial<AcceptDeps> = {}): AcceptDeps => ({
  db: t.db,
  chain: { isRegistered: async () => registered },
  coreId: "core.testnet",
  now: () => NOW,
  ...over,
});
const fresh = async () => {
  const app = testAppDeps(t.db);
  return createQuote(
    { db: t.db, ...app.quotes, now: () => NOW },
    { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: "alice.testnet" },
  );
};
const stateOf = async (id: string) =>
  (await t.db.select().from(quotes).where(eq(quotes.id, id)))[0]?.state;

describe("acceptQuote", () => {
  it("accepts a quote once, stores the plan and moves the quote to ACCEPTED", async () => {
    const q = await fresh();
    const res = await acceptQuote(accept(), q.id, "key-accept-1");
    expect(res.quoteId).toBe(q.id);
    expect(res.actions.map((a) => a.methodName)).toEqual(["ft_transfer_call"]);
    expect(await stateOf(q.id)).toBe("ACCEPTED");
    const [row] = await t.db.select().from(conversions).where(eq(conversions.id, res.conversionId));
    expect(row?.plan).toEqual(res.actions);
  });

  it("returns the original plan for a repeated key, even if on-chain registration changed since", async () => {
    const q = await fresh();
    const first = await acceptQuote(accept(), q.id, "key-replay");
    registered = false;
    const again = await acceptQuote(accept(), q.id, "key-replay");
    registered = true;
    expect(again).toEqual(first);
    expect(
      (await t.db.select().from(conversions).where(eq(conversions.quoteId, q.id))).length,
    ).toBe(1);
  });

  it("puts a storage deposit first when the user is not registered on the destination token", async () => {
    registered = false;
    const res = await acceptQuote(accept(), (await fresh()).id, "key-unregistered");
    registered = true;
    expect(res.actions.map((a) => a.methodName)).toEqual(["storage_deposit", "ft_transfer_call"]);
  });

  it("refuses a second key for an accepted quote and a reused key for another quote", async () => {
    const [a, b] = [await fresh(), await fresh()];
    await acceptQuote(accept(), a.id, "key-one");
    expect(await errorCodeOf(acceptQuote(accept(), a.id, "key-two"))).toBe("QUOTE_ALREADY_USED");
    expect(await errorCodeOf(acceptQuote(accept(), b.id, "key-one"))).toBe("VALIDATION_ERROR");
    expect(await stateOf(b.id)).toBe("QUOTED");
  });
});
