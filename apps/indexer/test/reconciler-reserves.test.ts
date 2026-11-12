import { describe, expect, it } from "vitest";
import { execution, useSeededDb } from "./harness.ts";
import * as fx from "./mirror-fixtures.ts";
import { makeReconciler, MINUTE, reserveStatusFixture } from "./reconcile-helpers.ts";

const h = useSeededDb();
const reserveFindings = (run: { findings: { kind: string; subject: string }[] }) =>
  run.findings
    .filter((f) => f.kind === "RESERVE_BREACH" || f.kind === "RESERVE_STALE")
    .map((f) => [f.kind, f.subject]);

describe("reserve checks", () => {
  it("read nothing for a representation without a policy", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    // No status is set for any representation: a read would throw.
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
    expect(chain.reserves.size).toBe(0);
  });

  it("flag a breach the mirror has not recorded, once it shows in two runs, and keep it until it clears", async () => {
    await h.apply(execution([fx.reservePolicySet({ representation_id: "a" })]));
    const { reconciler, chain } = makeReconciler(h.db);
    chain.reserves.set(
      "a",
      reserveStatusFixture({
        state: "breached",
        circulating_units: "1200",
        limit_units: "1000",
        ratio_bps: 8_333,
      }),
    );
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
    const confirmed = await reconciler.runOnce();
    expect(reserveFindings(confirmed)).toEqual([["RESERVE_BREACH", "a"]]);
    const finding = confirmed.findings.find((f) => f.kind === "RESERVE_BREACH");
    expect(finding).toMatchObject({ key: "reserve:a:breach", severity: "critical" });
    expect(finding?.message).toContain("1200 circulating against a limit of 1000");
    expect(finding?.message).toContain("83.33% cover");
    expect(finding?.message).toContain("simulated");
    expect(finding?.message).toContain("records no status");

    chain.reserves.set("a", reserveStatusFixture());
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
  });

  it("stay quiet about a breach the mirror already shows", async () => {
    await h.apply(execution([fx.reserveStatusChanged({ to_state: "breached", from_state: "ok" })]));
    const { reconciler, chain } = makeReconciler(h.db);
    chain.reserves.set("a", reserveStatusFixture({ state: "breached" }));
    await reconciler.runOnce();
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
  });

  it("do not flag a mirror that still says breached after the contract recovered", async () => {
    // The mirror trailing a recovery is not a reserve problem; the status refresh corrects it.
    const { reconciler, chain } = makeReconciler(h.db);
    chain.reserves.set("a", reserveStatusFixture({ state: "ok" }));
    await reconciler.runOnce();
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
  });

  it("flag stale attestations at once, with the age and the policy limit", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.reserves.set(
      "a",
      reserveStatusFixture({
        state: "stale",
        age_ms: 90 * MINUTE,
        max_reserve_age_ms: 60 * MINUTE,
      }),
    );
    const run = await reconciler.runOnce();
    expect(reserveFindings(run)).toEqual([["RESERVE_STALE", "a"]]);
    const finding = run.findings.find((f) => f.kind === "RESERVE_STALE");
    expect(finding).toMatchObject({ key: "reserve:a:stale", severity: "warning" });
    expect(finding?.message).toContain("90 min old");
    expect(finding?.message).toContain("allows 60 min");
    chain.reserves.set("a", reserveStatusFixture());
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
  });

  it("do not call a missing attestation stale", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.reserves.set("a", reserveStatusFixture({ state: "no_attestation", age_ms: null }));
    expect(reserveFindings(await reconciler.runOnce())).toEqual([]);
  });

  it("fail the run, like the vault reads, when the chain cannot be read", async () => {
    const { reconciler, chain } = makeReconciler(h.db);
    chain.failing = true;
    await expect(reconciler.runOnce()).rejects.toThrow("rpc down");
  });
});
