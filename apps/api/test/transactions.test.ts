import { ENDPOINTS, TransactionSchema } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptQuote } from "../src/conversions/accept.ts";
import { reportSubmitted } from "../src/conversions/submit.ts";
import { getTransaction, listTransactions } from "../src/conversions/transactions.ts";
import { conversions, quotes, settlementEvents } from "@pontis/db";
import { createQuote } from "../src/quotes/service.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "@pontis/db/testing";
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
const HASH = "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T";
const accepted = async (account = "alice.testnet", key = crypto.randomUUID()) => {
  const q = await createQuote(
    { db: t.db, ...testAppDeps(t.db).quotes, now: () => NOW },
    { fromId: "tgold-a", toId: "tgold-b", amountIn: "1000000", accountId: account },
  );
  const res = await acceptQuote(
    { db: t.db, chain: { isRegistered: async () => true }, coreId: "core.testnet", now: () => NOW },
    q.id,
    key,
  );
  return { quote: q, conversionId: res.conversionId };
};

describe("reportSubmitted", () => {
  it("records the hash, moves the quote to SUBMITTED and returns the transaction", async () => {
    const { conversionId } = await accepted();
    const tx = TransactionSchema.parse(await reportSubmitted(t.db, conversionId, HASH, NOW));
    expect([tx.state, tx.txHash, tx.submittedAt]).toEqual(["SUBMITTED", HASH, NOW.toISOString()]);
    expect(tx.quote.state).toBe("SUBMITTED");
  });

  it("is idempotent for the same hash and a conflict for a different one", async () => {
    const { conversionId } = await accepted();
    await reportSubmitted(t.db, conversionId, HASH, NOW);
    expect((await reportSubmitted(t.db, conversionId, HASH, NOW)).txHash).toBe(HASH);
    expect(
      await errorCodeOf(
        reportSubmitted(t.db, conversionId, "other-hash-other-hash-other-hash-xx", NOW),
      ),
    ).toBe("QUOTE_ALREADY_USED");
  });

  it("refuses a hash reported after the quote expired, and an unknown conversion", async () => {
    const { conversionId, quote } = await accepted();
    const late = new Date(NOW.getTime() + 61_000);
    expect(await errorCodeOf(reportSubmitted(t.db, conversionId, HASH, late))).toBe(
      "QUOTE_EXPIRED",
    );
    expect((await t.db.select().from(quotes).where(eq(quotes.id, quote.id)))[0]?.state).toBe(
      "EXPIRED",
    );
    expect(
      (await t.db.select().from(conversions).where(eq(conversions.id, conversionId)))[0]?.txHash,
    ).toBeNull();
    expect(
      await errorCodeOf(reportSubmitted(t.db, "00000000-0000-4000-8000-000000000000", HASH, NOW)),
    ).toBe("NOT_FOUND");
  });
});

describe("a hash reported after the indexer settled the conversion", () => {
  it("is recorded on the conversion and on its events, without changing the settled state", async () => {
    const { conversionId, quote } = await accepted();
    await t.db.update(quotes).set({ state: "SETTLED" }).where(eq(quotes.id, quote.id));
    await t.db.insert(settlementEvents).values({
      receiptId: "late-1",
      logIndex: 0,
      blockHeight: 9,
      blockTimestamp: NOW,
      txHash: null,
      eventName: "conversion_completed",
      data: {},
      conversionId,
    });
    const tx = TransactionSchema.parse(await reportSubmitted(t.db, conversionId, HASH, NOW));
    expect([tx.state, tx.txHash, tx.events.map((e) => e.txHash)]).toEqual([
      "SETTLED",
      HASH,
      [HASH],
    ]);
    expect(
      await errorCodeOf(
        reportSubmitted(t.db, conversionId, "other-hash-other-hash-other-hash-xx", NOW),
      ),
    ).toBe("QUOTE_ALREADY_USED");
  });
});

describe("transaction history", () => {
  it("lists an account's conversions newest first with their events, in contract shape", async () => {
    const first = await accepted("carol.testnet");
    const second = await accepted("carol.testnet");
    await accepted("dave.testnet");
    await t.db.insert(settlementEvents).values([
      {
        receiptId: "r2",
        logIndex: 0,
        blockHeight: 20,
        blockTimestamp: NOW,
        txHash: HASH,
        eventName: "conversion_completed",
        data: { amount_out: "1" },
        conversionId: first.conversionId,
      },
      {
        receiptId: "r1",
        logIndex: 0,
        blockHeight: 10,
        blockTimestamp: NOW,
        txHash: HASH,
        eventName: "vault_funded",
        data: {},
        conversionId: first.conversionId,
      },
    ]);
    const list = ENDPOINTS.listTransactions.response.parse({
      items: await listTransactions(t.db, "carol.testnet", 50),
    }).items;
    expect(list.map((x) => x.id)).toEqual([second.conversionId, first.conversionId]);
    expect(list[1]?.events.map((e) => e.blockHeight)).toEqual([10, 20]);
    expect(list.every((x) => x.quote.accountId === "carol.testnet")).toBe(true);
    expect(await listTransactions(t.db, "carol.testnet", 1)).toHaveLength(1);
    expect(await listTransactions(t.db, "nobody.testnet", 50)).toEqual([]);
  });

  it("returns one transaction by conversion id, or undefined", async () => {
    const { conversionId } = await accepted();
    expect((await getTransaction(t.db, conversionId))?.state).toBe("ACCEPTED");
    expect(await getTransaction(t.db, "00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});
