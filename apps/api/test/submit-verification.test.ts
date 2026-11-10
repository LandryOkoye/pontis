import { TransactionSchema } from "@pontis/api-types";
import { auditLog, quotes } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { ExpectedConversionTx, TxFacts, TxVerifier } from "@pontis/near-client";
import { conversionTxFacts, fixtureSource } from "@pontis/near-client/fixtures";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reportSubmitted } from "../src/conversions/submit.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { errorCodeOf } from "./helpers.ts";
import {
  HASH,
  NOW,
  OTHER,
  acceptConversion,
  expectedFor as expectedForDb,
  knows,
  settledByChain,
  storedConversion,
  submitDeps,
  unknownTx,
} from "./submit-helpers.ts";

// The chain's word decides what `txHash` is: these tests give the API a fake node.
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const accepted = (account?: string) => acceptConversion(t.db, account);
const deps = (verifier: TxVerifier, warnings: unknown[] = []) =>
  submitDeps(t.db, verifier, warnings);
const expectedFor = (id: string): Promise<ExpectedConversionTx> => expectedForDb(t.db, id);
const stored = (id: string) => storedConversion(t.db, id);

describe("reportSubmitted verifies the reported hash", () => {
  it("verifies a transaction that is the conversion's and returns it as verified", async () => {
    const { conversionId } = await accepted();
    const facts = conversionTxFacts(await expectedFor(conversionId));
    const tx = TransactionSchema.parse(
      await reportSubmitted(deps(knows(facts)), conversionId, HASH),
    );
    expect([tx.state, tx.txHash, tx.reportedTxHash, tx.txHashStatus, tx.submittedAt]).toEqual([
      "SUBMITTED",
      HASH,
      HASH,
      "VERIFIED",
      NOW.toISOString(),
    ]);
    expect(tx.quote.state).toBe("SUBMITTED");
  });

  it("stores the hash as reported and warns when the node cannot be reached", async () => {
    const { conversionId } = await accepted();
    const warnings: unknown[] = [];
    const down: TxVerifier = {
      getTransaction: async () => {
        throw new Error("rpc down");
      },
    };
    const tx = await reportSubmitted(deps(down, warnings), conversionId, HASH);
    expect([tx.state, tx.txHash, tx.txHashStatus]).toEqual(["SUBMITTED", null, "REPORTED"]);
    expect(warnings).toEqual([expect.objectContaining({ conversionId, error: "rpc down" })]);
  });

  describe("refuses a transaction that exists but is not the conversion's", () => {
    it.each<[string, (e: ExpectedConversionTx) => Partial<TxFacts>]>([
      ["another wallet's", () => ({ signerId: "mallory.testnet" })],
      [
        "an unrelated contract call",
        () => ({
          receiverId: "other.testnet",
          actions: [{ kind: "FunctionCall", methodName: "ft_transfer", args: {} }],
        }),
      ],
      [
        "the same wallet and token with another quote's nonce",
        (e) => ({
          actions: [
            {
              kind: "FunctionCall",
              methodName: "ft_transfer_call",
              args: {
                receiver_id: e.coreId,
                amount: e.amountIn,
                msg: JSON.stringify({ quote: { user: e.signerId, nonce: "f".repeat(32) } }),
              },
            },
          ],
        }),
      ],
    ])("%s", async (_name, change) => {
      const { conversionId, quote } = await accepted();
      const expected = await expectedFor(conversionId);
      const facts = conversionTxFacts(expected, change(expected));
      let error: unknown;
      try {
        await reportSubmitted(deps(knows(facts)), conversionId, HASH);
      } catch (e) {
        error = e;
      }
      expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
      const row = await stored(conversionId);
      expect([row?.reportedTxHash, row?.txHash, row?.txHashStatus]).toEqual([null, null, "NONE"]);
      expect((await t.db.select().from(quotes).where(eq(quotes.id, quote.id)))[0]?.state).toBe(
        "ACCEPTED",
      );
    });
  });

  it("verifies a reported hash when it is reported again and the node knows it by then", async () => {
    const { conversionId } = await accepted();
    await reportSubmitted(deps(unknownTx), conversionId, HASH);
    const facts = conversionTxFacts(await expectedFor(conversionId));
    const tx = await reportSubmitted(deps(knows(facts)), conversionId, HASH);
    expect([tx.txHash, tx.txHashStatus]).toEqual([HASH, "VERIFIED"]);
  });

  it("rejects a reported hash that turns out to be someone else's", async () => {
    const { conversionId } = await accepted();
    await reportSubmitted(deps(unknownTx), conversionId, HASH);
    const facts = conversionTxFacts(await expectedFor(conversionId), {
      signerId: "mallory.testnet",
    });
    expect(await errorCodeOf(reportSubmitted(deps(knows(facts)), conversionId, HASH))).toBe(
      "VALIDATION_ERROR",
    );
    const row = await stored(conversionId);
    expect([row?.reportedTxHash, row?.txHash, row?.txHashStatus]).toEqual([HASH, null, "REJECTED"]);
    expect(
      (await t.db.select().from(auditLog).where(eq(auditLog.subject, conversionId)))[0]?.action,
    ).toBe("conversion.tx_hash_rejected");
  });
});

describe("a hash reported after the indexer settled the conversion", () => {
  const settle = () => settledByChain(t.db);

  it("is verified against the settlement receipts and attributed to the events", async () => {
    const { conversionId } = await settle();
    const facts = conversionTxFacts(await expectedFor(conversionId));
    const tx = TransactionSchema.parse(
      await reportSubmitted(deps(knows(facts)), conversionId, HASH),
    );
    expect([tx.state, tx.txHash, tx.events.map((e) => e.txHash)]).toEqual([
      "SETTLED",
      HASH,
      [HASH],
    ]);
    expect(await errorCodeOf(reportSubmitted(deps(unknownTx), conversionId, OTHER))).toBe(
      "QUOTE_ALREADY_USED",
    );
  });

  it("refuses a transaction of this wallet and quote that did not produce the settlement receipt", async () => {
    const { conversionId } = await settle();
    const facts = conversionTxFacts(await expectedFor(conversionId), { receiptIds: ["elsewhere"] });
    expect(await errorCodeOf(reportSubmitted(deps(knows(facts)), conversionId, HASH))).toBe(
      "VALIDATION_ERROR",
    );
    expect((await stored(conversionId))?.txHashStatus).toBe("NONE");
  });
});
