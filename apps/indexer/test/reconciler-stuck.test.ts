import { auditLog, conversions } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { completed, execution, useSeededDb } from "./harness.ts";
import { MINUTE, addEvent, makeReconciler, quoteSubmitted } from "./reconcile-helpers.ts";

const h = useSeededDb();

describe("stuck submissions", () => {
  it("flags a submission with no outcome after the threshold, once, and keeps its first-seen time", async () => {
    const { reconciler, clock } = makeReconciler(h.db);
    const stuck = await quoteSubmitted(h.db, 11);
    const recent = await quoteSubmitted(h.db, 9);

    const first = await reconciler.runOnce();
    expect(await h.quoteState(stuck.quoteId)).toBe("REQUIRES_RECONCILIATION");
    expect(await h.quoteState(recent.quoteId)).toBe("SUBMITTED");
    expect((await h.conversion(stuck.conversionId))?.failureReason).toMatch(
      /No settlement event 10 minutes/,
    );
    expect(first.findings.map((f) => [f.kind, f.subject, f.severity])).toEqual([
      ["STUCK_SUBMITTED", stuck.quoteId, "critical"],
    ]);

    clock.now = new Date(clock.now.getTime() + MINUTE);
    const second = await reconciler.runOnce();
    expect(second.findings[0]?.firstSeenAt).toBe(first.findings[0]?.firstSeenAt);
    const audits = await h.db.select().from(auditLog).where(eq(auditLog.subject, stuck.quoteId));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "quote.requires_reconciliation",
      "reconciliation.finding",
    ]);
  });

  it("clears the finding and the failure reason when the missing completion finally arrives", async () => {
    const { reconciler } = makeReconciler(h.db);
    const q = await quoteSubmitted(h.db, 30);
    expect((await reconciler.runOnce()).findings.some((f) => f.subject === q.quoteId)).toBe(true);

    await h.apply(execution([completed(q.nonce)]));
    expect(await h.quoteState(q.quoteId)).toBe("SETTLED");
    expect((await h.conversion(q.conversionId))?.failureReason).toBeNull();
    expect((await reconciler.runOnce()).findings.some((f) => f.subject === q.quoteId)).toBe(false);
  });

  it("reports a stored completion on a quote that is still SUBMITTED instead of calling it stuck", async () => {
    const { reconciler } = makeReconciler(h.db);
    const q = await quoteSubmitted(h.db, 30);
    await addEvent(h.db, q.conversionId, "conversion_completed", { nonce: q.nonce });
    const run = await reconciler.runOnce();
    expect(run.findings.filter((f) => f.subject === q.quoteId).map((f) => f.kind)).toEqual([
      "COMPLETION_NOT_SETTLED",
    ]);
    expect(await h.quoteState(q.quoteId)).toBe("SUBMITTED");
    expect(
      (
        await h.db
          .select()
          .from(conversions)
          .where(eq(conversions.id, q.conversionId ?? ""))
      )[0]?.failureReason,
    ).toBeNull();
  });
});
