import { auditLog, conversions } from "@pontis/db";
import { conversionTxFacts } from "@pontis/near-client/fixtures";
import type { ExpectedConversionTx, TxFacts, TxVerifier } from "@pontis/near-client";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { verifyReportedHashes } from "../src/verify-hashes.ts";
import { FakeSource, silent } from "./fake-source.ts";
import { indexOnce } from "../src/indexer.ts";
import { completed, execution, useSeededDb } from "./harness.ts";
import { seedQuote } from "./seed.ts";

const h = useSeededDb();
const HASH = "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T";
const NOW = new Date("2026-11-07T18:10:00Z");

const expectedFor = (nonce: string, receiptId: string): ExpectedConversionTx => ({
  signerId: "alice.testnet",
  tokenIn: "ta.testnet",
  coreId: "core.testnet",
  amountIn: "1000000",
  nonce,
  settlementReceiptIds: [receiptId],
});

/** A node that answers every lookup with `answer` and counts the questions. */
function node(answer: () => TxFacts | undefined | Error) {
  const calls: string[] = [];
  const verifier: TxVerifier = {
    async getTransaction(hash) {
      calls.push(hash);
      const result = answer();
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { verifier, calls };
}

const verify = (verifier: TxVerifier, now = NOW, log = silent) =>
  verifyReportedHashes({ db: h.db, verifier, coreId: "core.testnet", log, now: () => now });
const row = async (id: string | undefined) => {
  const c = await h.conversion(id);
  return [c?.reportedTxHash, c?.txHash, c?.txHashStatus];
};

describe("verifyReportedHashes", () => {
  it("promotes a reported hash whose transaction produced the settlement receipt", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    // Reported, but never copied: nothing is verified yet.
    expect(await row(q.conversionId)).toEqual([HASH, null, "REPORTED"]);
    const { verifier, calls } = node(() => conversionTxFacts(expectedFor(q.nonce, exec.receiptId)));
    expect(await verify(verifier)).toEqual({ verified: 1, rejected: 0, inconclusive: 0 });
    expect(calls).toEqual([HASH]);
    expect(await row(q.conversionId)).toEqual([HASH, HASH, "VERIFIED"]);
    expect((await h.eventsOf(exec.receiptId)).map((e) => e.txHash)).toEqual([HASH]);
    // Nothing is left to check.
    expect(await verify(verifier, new Date(NOW.getTime() + 3_600_000))).toEqual({
      verified: 0,
      rejected: 0,
      inconclusive: 0,
    });
    expect(calls).toHaveLength(1);
  });

  it("never promotes a transaction of another wallet", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    const facts = conversionTxFacts(expectedFor(q.nonce, exec.receiptId), {
      signerId: "mallory.testnet",
    });
    const log = { ...silent, errors: [] as string[] };
    expect(await verify(node(() => facts).verifier, NOW, log)).toMatchObject({ rejected: 1 });
    expect(await row(q.conversionId)).toEqual([HASH, null, "REJECTED"]);
    expect((await h.eventsOf(exec.receiptId)).map((e) => e.txHash)).toEqual([null]);
    expect(log.errors).toEqual(["reported transaction hash rejected"]);
    const [audit] = await h.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.subject, q.conversionId ?? ""));
    expect([audit?.actor, audit?.action]).toEqual(["indexer", "conversion.tx_hash_rejected"]);
    // The settlement itself is untouched.
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
  });

  it("never promotes a transaction of this quote that did not produce the settlement receipt", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    const facts = conversionTxFacts(expectedFor(q.nonce, "x"), { receiptIds: ["another-receipt"] });
    expect(await verify(node(() => facts).verifier)).toMatchObject({ rejected: 1 });
    expect(await row(q.conversionId)).toEqual([HASH, null, "REJECTED"]);
  });

  it("leaves the hash reported and tries again later when the node does not know it or is down", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    let answer: TxFacts | undefined | Error = undefined;
    const { verifier, calls } = node(() => answer);
    expect(await verify(verifier)).toEqual({ verified: 0, rejected: 0, inconclusive: 1 });
    expect(await row(q.conversionId)).toEqual([HASH, null, "REPORTED"]);

    // Too soon to ask again.
    await verify(verifier, new Date(NOW.getTime() + 10_000));
    expect(calls).toHaveLength(1);

    const log = { ...silent, errors: [] as string[] };
    answer = new Error("rpc down");
    await verify(verifier, new Date(NOW.getTime() + 61_000), log);
    expect(log.errors).toEqual(["could not verify a reported transaction hash; will retry"]);
    expect(await row(q.conversionId)).toEqual([HASH, null, "REPORTED"]);

    answer = conversionTxFacts(expectedFor(q.nonce, exec.receiptId));
    expect(await verify(verifier, new Date(NOW.getTime() + 130_000))).toMatchObject({
      verified: 1,
    });
    expect(await row(q.conversionId)).toEqual([HASH, HASH, "VERIFIED"]);
  });

  it("settles without a reported hash and leaves the verified hash empty", async () => {
    const q = await seedQuote(h.db, "SUBMITTED");
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    const { verifier, calls } = node(() => undefined);
    expect(await verify(verifier)).toEqual({ verified: 0, rejected: 0, inconclusive: 0 });
    expect(calls).toEqual([]);
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
    expect(await row(q.conversionId)).toEqual([null, null, "NONE"]);
  });

  it("checks a hash the API verified before the outcome was indexed against the receipts", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    await h.db
      .update(conversions)
      .set({ txHash: HASH, txHashStatus: "VERIFIED", txHashCheckedAt: NOW })
      .where(eq(conversions.id, q.conversionId ?? ""));
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    const wrong = node(() => conversionTxFacts(expectedFor(q.nonce, "x"), { receiptIds: ["no"] }));
    expect(await verify(wrong.verifier, NOW)).toMatchObject({ rejected: 1 });
    expect(await row(q.conversionId)).toEqual([HASH, null, "REJECTED"]);

    const ok = await seedQuote(h.db, "SUBMITTED", HASH);
    await h.db
      .update(conversions)
      .set({ txHash: HASH, txHashStatus: "VERIFIED", txHashCheckedAt: NOW })
      .where(eq(conversions.id, ok.conversionId ?? ""));
    const exec2 = execution([completed(ok.nonce)]);
    await h.apply(exec2);
    const good = node(() => conversionTxFacts(expectedFor(ok.nonce, exec2.receiptId)));
    expect(await verify(good.verifier, NOW)).toMatchObject({ verified: 1 });
    expect((await h.eventsOf(exec2.receiptId)).map((e) => e.txHash)).toEqual([HASH]);
  });

  it("ignores a replayed nonce's rejection as evidence", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    await h.apply(execution([["conversion_rejected", { nonce: q.nonce, reason: "NONCE_USED" }]]));
    const { verifier, calls } = node(() => undefined);
    await verify(verifier);
    expect(calls).toEqual([]);
  });
});

describe("indexOnce", () => {
  it("verifies reported hashes after applying the block, and survives a node failure", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", HASH);
    const exec = execution([completed(q.nonce)]);
    const source = new FakeSource(105);
    source.put(100, exec);
    const down = node(() => new Error("rpc down"));
    const options = (verifier: TxVerifier) => ({
      db: h.db,
      source,
      verifier,
      coreId: "core.testnet",
      log: silent,
      confirmations: 0,
      startHeight: 100,
    });
    const pass = await indexOnce(options(down.verifier));
    expect([pass.stored, pass.hashes.inconclusive]).toEqual([1, 1]);
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
    expect(await row(q.conversionId)).toEqual([HASH, null, "REPORTED"]);
  });
});
