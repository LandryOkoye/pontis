import { auditLog, settlementEvents } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { completed, execution, useSeededDb } from "./harness.ts";
import { seedQuote } from "./seed.ts";

const h = useSeededDb();

describe("applyExecutions", () => {
  it("settles a submitted quote and attributes the event, with the reported hash", async () => {
    const q = await seedQuote(h.db, "SUBMITTED", "HASH-1");
    const exec = execution([completed(q.nonce)]);
    expect(await h.apply(exec)).toEqual({ stored: 1, duplicates: 0 });
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
    expect((await h.conversion(q.conversionId))?.settledAt).toEqual(exec.blockTimestamp);
    const [event] = await h.db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.receiptId, exec.receiptId));
    expect([event?.conversionId, event?.txHash, event?.eventName]).toEqual([
      q.conversionId,
      "HASH-1",
      "conversion_completed",
    ]);
  });

  it("changes nothing when the same execution is applied again", async () => {
    const q = await seedQuote(h.db, "SUBMITTED");
    const exec = execution([completed(q.nonce, { amount_out: "1" })]);
    await h.apply(exec);
    expect(await h.apply(exec)).toEqual({ stored: 0, duplicates: 1 });
    expect(
      await h.db
        .select()
        .from(settlementEvents)
        .where(eq(settlementEvents.receiptId, exec.receiptId)),
    ).toHaveLength(1);
    const audits = await h.db.select().from(auditLog).where(eq(auditLog.subject, q.quoteId));
    expect(audits).toHaveLength(1);
  });
});
