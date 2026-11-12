import { describe, expect, it } from "vitest";
import { execution, useSeededDb } from "./harness.ts";
import * as fx from "./mirror-fixtures.ts";
import { makeReconciler, MINUTE, NOW } from "./reconcile-helpers.ts";

const h = useSeededDb();
const ms = (minutesFromNow: number) => NOW.getTime() + minutesFromNow * MINUTE;
const findings = (run: { findings: { kind: string; subject: string }[] }, kind: string) =>
  run.findings.filter((f) => f.kind === kind).map((f) => f.subject);

describe("overdue redemptions", () => {
  it("flags a requested redemption more than 5 minutes past its accept deadline", async () => {
    await h.apply(
      execution([
        fx.redemptionRequested({ id: 1, accept_deadline_ms: ms(-6) }),
        fx.redemptionRequested({ id: 2, accept_deadline_ms: ms(-5) }),
        fx.redemptionRequested({ id: 3, accept_deadline_ms: ms(10) }),
      ]),
    );
    const { reconciler } = makeReconciler(h.db);
    const run = await reconciler.runOnce();
    expect(findings(run, "REDEMPTION_OVERDUE")).toEqual(["1"]);
    const finding = run.findings.find((f) => f.kind === "REDEMPTION_OVERDUE");
    expect(finding).toMatchObject({ key: "redemption:1:overdue", severity: "warning" });
    expect(finding?.message).toContain("still requested 6 min after its accept deadline");
    expect(finding?.message).toContain("expire_redemption");
  });

  it("flags an accepted redemption past its fulfil deadline, not the accept deadline", async () => {
    await h.apply(
      execution([
        fx.redemptionRequested({ id: 4, accept_deadline_ms: ms(-1_000) }),
        fx.redemptionAccepted({ id: 4, accepted_ms: ms(-900), fulfil_deadline_ms: ms(-10) }),
        fx.redemptionRequested({ id: 5, accept_deadline_ms: ms(-1_000) }),
        fx.redemptionAccepted({ id: 5, accepted_ms: ms(-900), fulfil_deadline_ms: ms(60) }),
      ]),
    );
    const { reconciler } = makeReconciler(h.db);
    const run = await reconciler.runOnce();
    expect(findings(run, "REDEMPTION_OVERDUE")).toEqual(["1", "4"]);
    expect(run.findings.find((f) => f.subject === "4")?.message).toContain(
      "still accepted 10 min after its fulfil deadline",
    );
  });

  it("clears once the redemption is expired, rejected, fulfilled or reclaimed", async () => {
    await h.apply(
      execution([
        fx.redemptionExpired({ id: 1 }),
        fx.redemptionFulfilled({ id: 4 }),
        fx.redemptionRequested({ id: 6, accept_deadline_ms: ms(-60) }),
        fx.redemptionRejected({ id: 6 }),
      ]),
    );
    const { reconciler } = makeReconciler(h.db);
    expect(findings(await reconciler.runOnce(), "REDEMPTION_OVERDUE")).toEqual([]);
  });
});

describe("escrow accounting", () => {
  // Redemptions 1 (expired), 2 and 3 (requested), 5 (accepted) and 6 (rejected) hold escrow in
  // the mirror: 5 x 5 000 000 tokens of representation a. Redemption 4 was fulfilled.
  const OPEN = "25000000";
  const escrow = (run: { findings: { kind: string; subject: string }[] }) =>
    findings(run, "ESCROW_MISMATCH");
  const vault = (run: { findings: { kind: string; subject: string }[] }) =>
    run.findings.filter((f) => f.kind.startsWith("VAULT")).map((f) => f.kind);

  it("is quiet when open escrow, inventory and pending input add up to the core's balance", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.set("a", "100", "25000100");
    chain.escrow.set("a", OPEN);
    await reconciler.runOnce();
    const run = await reconciler.runOnce();
    expect(escrow(run)).toEqual([]);
    expect(vault(run)).toEqual([]);
    expect(run.vaults[0]).toMatchObject({
      representationId: "a",
      inventory: "25000100",
      balance: "25000100",
    });
  });

  it("flags escrow the core's books hold but the mirror does not (a missed event), over two runs", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.set("a", "100", "30000100");
    chain.escrow.set("a", "30000000");
    expect(escrow(await reconciler.runOnce())).toEqual([]);
    const run = await reconciler.runOnce();
    expect(escrow(run)).toEqual(["a"]);
    const finding = run.findings.find((f) => f.kind === "ESCROW_MISMATCH");
    expect(finding).toMatchObject({ key: "escrow:a:mismatch", severity: "warning" });
    expect(finding?.message).toContain(`mirror (${OPEN})`);
    expect(finding?.message).toContain("holds 30000100 tokens");
    expect(vault(run)).toEqual([]);
  });

  it("is critical when the core holds fewer tokens than the open escrows and inventory require", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    // The books agree with the balance, so the vault check is quiet; the mirror's open escrow is larger.
    chain.set("a", "100", "20000100");
    chain.escrow.set("a", "20000000");
    await reconciler.runOnce();
    const run = await reconciler.runOnce();
    expect(run.findings.find((f) => f.kind === "ESCROW_MISMATCH")).toMatchObject({
      severity: "critical",
    });
    expect(vault(run)).toEqual([]);
  });

  it("leaves a vault shortfall to the vault check instead of reporting it twice", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.set("a", "100", "5");
    chain.escrow.set("a", OPEN);
    await reconciler.runOnce();
    const run = await reconciler.runOnce();
    expect(vault(run)).toEqual(["VAULT_INSOLVENT"]);
    expect(escrow(run)).toEqual([]);
  });

  it("does not count a fulfilled or reclaimed redemption as open, and ignores a representation with no redemptions", async () => {
    await h.apply(
      execution([fx.redemptionReclaimed({ id: 2 }), fx.redemptionReclaimed({ id: 3 })]),
    );
    const { reconciler, chain } = makeReconciler(h.db);
    // 2 and 3 are back with their users: 15 000 000 remain open (1, 5 and 6).
    chain.set("a", "100", "15000100");
    chain.escrow.set("a", "15000000");
    chain.set("b", "50", "50");
    await reconciler.runOnce();
    expect(escrow(await reconciler.runOnce())).toEqual([]);
  });
});
