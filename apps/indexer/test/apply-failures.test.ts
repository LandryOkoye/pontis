import { auditLog } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { completed, execution, useSeededDb } from "./harness.ts";
import { seedQuote } from "./seed.ts";

const h = useSeededDb();

describe("applyExecutions: failures and disagreements", () => {
  it("fails the conversion with the contract's reason when the payout failed or the input was refused", async () => {
    const payout = await seedQuote(h.db, "SUBMITTED");
    await h.apply(
      execution([["conversion_failed", { nonce: payout.nonce, reason: "PAYOUT_FAILED" }]]),
    );
    expect(await h.quoteState(payout.quoteId)).toBe("FAILED");
    expect((await h.conversion(payout.conversionId))?.failureReason).toBe("PAYOUT_FAILED");

    const refused = await seedQuote(h.db, "SUBMITTED");
    await h.apply(
      execution([["conversion_rejected", { nonce: refused.nonce, reason: "QUOTE_EXPIRED" }]]),
    );
    expect(await h.quoteState(refused.quoteId)).toBe("FAILED");
  });

  it("does not let a replayed nonce disturb a settled conversion", async () => {
    const q = await seedQuote(h.db, "SUBMITTED");
    await h.apply(execution([completed(q.nonce)]));
    await h.apply(execution([["conversion_rejected", { nonce: q.nonce, reason: "NONCE_USED" }]]));
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
  });

  it("sends a completion that disagrees with the quote to reconciliation and records why", async () => {
    const q = await seedQuote(h.db, "SUBMITTED");
    await h.apply(execution([completed(q.nonce, { amount_out: "5" })]));
    expect(await h.quoteState(q.quoteId)).toBe("REQUIRES_RECONCILIATION");
    expect((await h.conversion(q.conversionId))?.failureReason).toMatch(
      /amount_out on chain \(5\)/,
    );
    const [audit] = await h.db.select().from(auditLog).where(eq(auditLog.subject, q.quoteId));
    expect([audit?.actor, audit?.action]).toEqual(["indexer", "quote.requires_reconciliation"]);
  });
});
