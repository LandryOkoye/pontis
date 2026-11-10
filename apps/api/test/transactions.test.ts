import { ENDPOINTS } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTransaction, listTransactions } from "../src/conversions/transactions.ts";
import { reportSubmitted } from "../src/conversions/submit.ts";
import { quotes, settlementEvents } from "@pontis/db";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { errorCodeOf } from "./helpers.ts";
import {
  HASH,
  NOW,
  OTHER,
  acceptConversion,
  settledByChain,
  storedConversion,
  submitDeps,
  unknownTx,
} from "./submit-helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const accepted = (account?: string) => acceptConversion(t.db, account);
const deps = (verifier: typeof unknownTx) => submitDeps(t.db, verifier);
const stored = (id: string) => storedConversion(t.db, id);
const settle = () => settledByChain(t.db);

describe("reportSubmitted", () => {
  it("stores a hash the node does not know as reported only, never as verified", async () => {
    const { conversionId } = await accepted();
    const tx = await reportSubmitted(deps(unknownTx), conversionId, HASH);
    expect([tx.state, tx.txHash, tx.reportedTxHash, tx.txHashStatus]).toEqual([
      "SUBMITTED",
      null,
      HASH,
      "REPORTED",
    ]);
    expect((await stored(conversionId))?.txHash).toBeNull();
  });

  it("is idempotent for the same hash and a conflict for a different one", async () => {
    const { conversionId } = await accepted();
    await reportSubmitted(deps(unknownTx), conversionId, HASH);
    const again = await reportSubmitted(deps(unknownTx), conversionId, HASH);
    expect([again.txHash, again.reportedTxHash]).toEqual([null, HASH]);
    expect(await errorCodeOf(reportSubmitted(deps(unknownTx), conversionId, OTHER))).toBe(
      "QUOTE_ALREADY_USED",
    );
  });

  it("refuses a hash reported after the quote expired, and an unknown conversion", async () => {
    const { conversionId, quote } = await accepted();
    const late = new Date(NOW.getTime() + 61_000);
    expect(
      await errorCodeOf(reportSubmitted({ ...deps(unknownTx), now: late }, conversionId, HASH)),
    ).toBe("QUOTE_EXPIRED");
    expect((await t.db.select().from(quotes).where(eq(quotes.id, quote.id)))[0]?.state).toBe(
      "EXPIRED",
    );
    expect((await stored(conversionId))?.reportedTxHash).toBeNull();
    expect(
      await errorCodeOf(
        reportSubmitted(deps(unknownTx), "00000000-0000-4000-8000-000000000000", HASH),
      ),
    ).toBe("NOT_FOUND");
  });
});

describe("a hash reported after the indexer settled the conversion", () => {
  it("keeps an unverifiable hash as reported, leaving the events without a hash", async () => {
    const { conversionId } = await settle();
    const tx = await reportSubmitted(deps(unknownTx), conversionId, HASH);
    expect([tx.state, tx.txHash, tx.reportedTxHash, tx.events.map((e) => e.txHash)]).toEqual([
      "SETTLED",
      null,
      HASH,
      [null],
    ]);
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
        txHash: null,
        eventName: "conversion_completed",
        data: { amount_out: "1" },
        conversionId: first.conversionId,
      },
      {
        receiptId: "r1",
        logIndex: 0,
        blockHeight: 10,
        blockTimestamp: NOW,
        txHash: null,
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
