import { auditLog } from "@pontis/db";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { loadRun } from "../src/reconcile/report.ts";
import { runReconciler } from "../src/reconcile/reconciler.ts";
import { silent } from "./fake-source.ts";
import { useSeededDb } from "./harness.ts";
import { makeReconciler } from "./reconcile-helpers.ts";

const h = useSeededDb();
const vaultFindings = (run: { findings: { kind: string; subject: string }[] }) =>
  run.findings.filter((f) => f.kind.startsWith("VAULT")).map((f) => [f.kind, f.subject]);

describe("vault solvency", () => {
  it("reports every vault's inventory next to the tokens the core holds", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.set("a", "500", "500");
    chain.set("b", "10", "10");
    const run = await reconciler.runOnce();
    expect(run.vaults).toEqual([
      { representationId: "a", tokenAccountId: "ta.testnet", inventory: "500", balance: "500" },
      { representationId: "b", tokenAccountId: "tb.testnet", inventory: "10", balance: "10" },
    ]);
    expect(vaultFindings(run)).toEqual([]);
  });

  it("confirms a mismatch only when it shows in two runs in a row, then keeps it until it clears", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.set("a", "900", "500");
    chain.set("b", "10", "40");
    expect(vaultFindings(await reconciler.runOnce())).toEqual([]);
    const confirmed = await reconciler.runOnce();
    expect(vaultFindings(confirmed)).toEqual([
      ["VAULT_INSOLVENT", "a"],
      ["VAULT_UNTRACKED_BALANCE", "b"],
    ]);
    expect(confirmed.findings.map((f) => f.severity)).toEqual(["critical", "warning"]);

    chain.set("a", "500", "500");
    expect(vaultFindings(await reconciler.runOnce())).toEqual([["VAULT_UNTRACKED_BALANCE", "b"]]);
    chain.set("b", "40", "40");
    expect(vaultFindings(await reconciler.runOnce())).toEqual([]);
  });

  it("stores the latest run and audits a finding once, however many runs repeat it", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    const audited = async () =>
      (await h.db.select().from(auditLog).where(eq(auditLog.action, "reconciliation.finding")))
        .length;
    chain.set("a", "7", "1");
    chain.set("b", "0", "0");
    const before = await audited();
    await reconciler.runOnce();
    const confirmed = await reconciler.runOnce();
    expect(await audited()).toBe(before + 1);
    await reconciler.runOnce();
    expect(await audited()).toBe(before + 1);
    expect(await loadRun(h.db)).toMatchObject({ findings: [{ key: "vault:a:insolvent" }] });
    expect(confirmed.findings[0]?.firstSeenAt).toBe(
      (await loadRun(h.db))?.findings[0]?.firstSeenAt,
    );
  });
});

describe("runReconciler", () => {
  it("logs a failed run and carries on with the next one", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.set("a", "1", "1");
    chain.failing = true;
    const controller = new AbortController();
    const sleep = vi.fn(async () => {
      if (sleep.mock.calls.length === 1) chain.failing = false;
      else controller.abort();
    });
    silent.errors.length = 0;
    await runReconciler({
      reconciler,
      intervalMs: 60_000,
      signal: controller.signal,
      log: silent,
      sleep,
    });
    expect(silent.errors).toEqual(["reconciliation failed; will retry"]);
    expect((await loadRun(h.db))?.vaults.map((v) => v.representationId)).toEqual(["a", "b"]);
  });
});
