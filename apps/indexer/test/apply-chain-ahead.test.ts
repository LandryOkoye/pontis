import { settlementEvents } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { completed, execution, useSeededDb } from "./harness.ts";
import { seedQuote } from "./seed.ts";

const h = useSeededDb();

describe("applyExecutions: chain ahead of the API", () => {
  it("treats an accepted quote the chain already executed as submitted, and keeps the hash unknown", async () => {
    const q = await seedQuote(h.db, "ACCEPTED");
    const exec = execution([completed(q.nonce)]);
    await h.apply(exec);
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
    expect((await h.conversion(q.conversionId))?.submittedAt).toEqual(exec.blockTimestamp);
    const [event] = await h.db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.receiptId, exec.receiptId));
    expect(event?.txHash).toBeNull();
  });

  it("flags a quote executed on chain that was never accepted or was already swept as expired", async () => {
    for (const state of ["QUOTED", "EXPIRED"] as const) {
      const q = await seedQuote(h.db, state);
      await h.apply(execution([completed(q.nonce)]));
      expect(await h.quoteState(q.quoteId)).toBe("REQUIRES_RECONCILIATION");
    }
    const harmless = await seedQuote(h.db, "EXPIRED");
    await h.apply(
      execution([["conversion_rejected", { nonce: harmless.nonce, reason: "QUOTE_EXPIRED" }]]),
    );
    expect(await h.quoteState(harmless.quoteId)).toBe("EXPIRED");
  });

  it("ignores events from receipts that panicked, and stores events that are not about a quote", async () => {
    const q = await seedQuote(h.db, "SUBMITTED");
    await h.apply(execution([completed(q.nonce)], { success: false }));
    expect(await h.quoteState(q.quoteId)).toBe("SUBMITTED");

    const admin = execution([["fee_updated", { fee_bps: 25, by: "owner.testnet" }]]);
    expect(await h.apply(admin)).toEqual({ stored: 1, duplicates: 0 });
    const [event] = await h.db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.receiptId, admin.receiptId));
    expect([event?.eventName, event?.conversionId]).toEqual(["fee_updated", null]);
  });
});
