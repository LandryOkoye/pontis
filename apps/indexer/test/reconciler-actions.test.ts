import { assetRepresentations } from "@pontis/db";
import type { ChainCorporateAction } from "@pontis/near-client";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useSeededDb } from "./harness.ts";
import { makeReconciler, MINUTE, NOW } from "./reconcile-helpers.ts";

const h = useSeededDb();

function action(over: Partial<ChainCorporateAction> = {}): ChainCorporateAction {
  return {
    id: "act-1",
    asset_id: "gold",
    kind: "SPLIT",
    announced_at_ms: 0,
    ex_date_ms: 0,
    effective_ms: NOW.getTime() - 11 * MINUTE,
    freeze_from_ms: 0,
    freeze_until_ms: 0,
    multiplier_change: { num: "1", den: "2" },
    evidence: [],
    status: "approved",
    proposed_by: "ops.testnet",
    approved_by: "ops.testnet",
    applied_representations: [],
    history: [],
    ...over,
  } as ChainCorporateAction;
}

async function overdue(over: Partial<ChainCorporateAction>, setup?: () => Promise<void>) {
  const { reconciler, chain } = makeReconciler(h.db);
  chain.actions.set("gold", [action(over)]);
  await setup?.();
  const run = await reconciler.runOnce();
  return run.findings.filter((f) => f.kind === "CORPORATE_ACTION_OVERDUE");
}

describe("overdue corporate actions", () => {
  it("raises a warning naming the unapplied wrappers once 10 minutes have passed", async () => {
    const found = await overdue({ applied_representations: ["a"] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: "action:act-1:overdue",
      severity: "warning",
      subject: "act-1",
    });
    expect(found[0]?.message).toContain("11 min");
    expect(found[0]?.message).toContain("b has not applied");
    expect(found[0]?.message).not.toContain("a,");
  });

  it("is quiet at exactly 10 minutes and before", async () => {
    expect(await overdue({ effective_ms: NOW.getTime() - 10 * MINUTE })).toEqual([]);
    expect(await overdue({ effective_ms: NOW.getTime() - 5 * MINUTE })).toEqual([]);
    expect(await overdue({ effective_ms: NOW.getTime() + MINUTE })).toEqual([]);
  });

  it("is quiet when every live wrapper applied", async () => {
    expect(await overdue({ applied_representations: ["a", "b"] })).toEqual([]);
  });

  it("ignores a rejected or deprecated wrapper that did not apply", async () => {
    const mark = (status: "rejected" | "deprecated") => () =>
      h.db
        .update(assetRepresentations)
        .set({ status })
        .where(eq(assetRepresentations.id, "b"))
        .then(() => undefined);
    expect(await overdue({ applied_representations: ["a"] }, mark("rejected"))).toEqual([]);
    expect(await overdue({ applied_representations: ["a"] }, mark("deprecated"))).toEqual([]);
    await h.db.update(assetRepresentations).set({ status: "active" });
  });

  it("only counts approved actions", async () => {
    for (const status of ["proposed", "applied", "cancelled"] as const)
      expect(await overdue({ status })).toEqual([]);
  });

  it("ignores actions without a multiplier change", async () => {
    expect(await overdue({ multiplier_change: null })).toEqual([]);
  });

  it("clears once the last wrapper applies", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.actions.set("gold", [action({ applied_representations: ["a"] })]);
    expect((await reconciler.runOnce()).findings.map((f) => f.kind)).toEqual([
      "CORPORATE_ACTION_OVERDUE",
    ]);
    chain.actions.set("gold", [action({ applied_representations: ["a", "b"] })]);
    expect((await reconciler.runOnce()).findings).toEqual([]);
  });

  it("fails the run when the chain read fails, like the vault reads", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.failing = true;
    await expect(reconciler.runOnce()).rejects.toThrow("rpc down");
  });
});
