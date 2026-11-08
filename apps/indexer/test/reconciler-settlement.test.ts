import { describe, expect, it } from "vitest";
import { useSeededDb } from "./harness.ts";
import { addEvent, makeReconciler, quoteSubmitted } from "./reconcile-helpers.ts";

const h = useSeededDb();
const kinds = async (subject: string) =>
  (await makeReconciler(h.db).reconciler.runOnce()).findings
    .filter((f) => f.subject === subject)
    .map((f) => f.kind);
const done = { user: "alice.testnet", amount_in: "1000000", amount_out: "999000" };

describe("settlement consistency", () => {
  it("accepts a settled quote whose completion event matches it", async () => {
    const q = await quoteSubmitted(h.db, 1, "SETTLED");
    await addEvent(h.db, q.conversionId, "conversion_completed", { nonce: q.nonce, ...done });
    expect(await kinds(q.quoteId)).toEqual([]);
  });

  it("flags a settled quote with no completion event", async () => {
    const q = await quoteSubmitted(h.db, 1, "SETTLED");
    await addEvent(h.db, q.conversionId, "fee_updated", {});
    expect(await kinds(q.quoteId)).toEqual(["SETTLED_WITHOUT_EVENT"]);
  });

  it("flags a settled quote whose event shows another amount or user", async () => {
    const amount = await quoteSubmitted(h.db, 1, "SETTLED");
    await addEvent(h.db, amount.conversionId, "conversion_completed", {
      nonce: amount.nonce,
      ...done,
      amount_out: "1",
    });
    expect(await kinds(amount.quoteId)).toEqual(["SETTLEMENT_MISMATCH"]);

    const user = await quoteSubmitted(h.db, 1, "SETTLED");
    await addEvent(h.db, user.conversionId, "conversion_completed", {
      nonce: user.nonce,
      ...done,
      user: "mallory.testnet",
    });
    const [finding] = (await makeReconciler(h.db).reconciler.runOnce()).findings.filter(
      (f) => f.subject === user.quoteId,
    );
    expect(finding?.message).toMatch(/user on chain \(mallory.testnet\)/);
  });

  it("flags a failed quote that has a completion event", async () => {
    const q = await quoteSubmitted(h.db, 1, "FAILED");
    await addEvent(h.db, q.conversionId, "conversion_completed", { nonce: q.nonce, ...done });
    expect(await kinds(q.quoteId)).toEqual(["COMPLETION_NOT_SETTLED"]);
  });

  it("leaves a quote waiting for reconciliation to the reconciliation list, not to a second finding", async () => {
    const q = await quoteSubmitted(h.db, 1, "REQUIRES_RECONCILIATION");
    await addEvent(h.db, q.conversionId, "conversion_completed", {
      nonce: q.nonce,
      ...done,
      amount_out: "5",
    });
    expect(await kinds(q.quoteId)).toEqual([]);
  });
});
