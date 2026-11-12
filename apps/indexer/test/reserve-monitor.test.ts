import { auditLog, loadReserveMonitorReport, reserveStatus } from "@pontis/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { ReserveChain } from "../src/chain-views.ts";
import {
  ReserveMonitor,
  runReserveMonitor,
  type MonitorSigner,
} from "../src/reserve-monitor/monitor.ts";
import { silent } from "./fake-source.ts";
import { execution, useSeededDb } from "./harness.ts";
import * as fx from "./mirror-fixtures.ts";
import { MINUTE, NOW, reserveStatusFixture } from "./reconcile-helpers.ts";

const h = useSeededDb();

class FakeReserveChain implements ReserveChain {
  statuses = new Map<string, ReturnType<typeof reserveStatusFixture>>();
  failing = new Set<string>();
  async reserveStatus(id: string) {
    if (this.failing.has(id)) throw new Error("view failed");
    const s = this.statuses.get(id);
    if (!s) throw new Error("no status");
    return s;
  }
  async escrowHeld() {
    return "0";
  }
}

class FakeSigner implements MonitorSigner {
  accountId = "monitor.testnet";
  calls: string[] = [];
  failing = new Set<string>();
  async call(method: "refresh_supply" | "evaluate_reserve", args: { representation_id: string }) {
    const label = `${method}:${args.representation_id}`;
    this.calls.push(label);
    if (this.failing.has(label)) throw new Error("tx failed");
  }
}

function setup() {
  const chain = new FakeReserveChain();
  const signer = new FakeSigner();
  const clock = { now: NOW };
  const monitor = new ReserveMonitor({ db: h.db, chain, signer, now: () => clock.now });
  return { chain, signer, clock, monitor };
}

const policy = (rep: string) =>
  fx.reservePolicySet({ representation_id: rep, timestamp_ms: fx.T0 });

describe("reserve monitor", () => {
  it("has nothing to do until a representation has a policy", async () => {
    const { monitor, signer } = setup();
    const report = await monitor.runOnce();
    expect(report).toMatchObject({
      entries: [],
      breaches: [],
      stale: [],
      failed: [],
      simulated: true,
      source: "reserve_monitor",
      signer: "monitor.testnet",
    });
    expect(signer.calls).toEqual([]);
  });

  it("refreshes the supply, evaluates, reads the status and stores the pass for each monitored representation", async () => {
    await h.apply(execution([policy("a"), policy("b"), fx.reserveStatusChanged()]));
    const { monitor, signer, chain } = setup();
    chain.statuses.set("a", reserveStatusFixture());
    chain.statuses.set("b", reserveStatusFixture({ state: "stale", age_ms: 2 * 86_400_000 }));

    const report = await monitor.runOnce();
    expect(signer.calls).toEqual([
      "refresh_supply:a",
      "evaluate_reserve:a",
      "refresh_supply:b",
      "evaluate_reserve:b",
    ]);
    expect(
      report.entries.map((e) => [e.representationId, e.state, e.refreshedSupply, e.evaluated]),
    ).toEqual([
      ["a", "ok", true, true],
      ["b", "stale", true, true],
    ]);
    expect(report).toMatchObject({ breaches: [], stale: ["b"], failed: [] });
    expect(report.entries[0]).toMatchObject({
      attestedUnits: "1000",
      circulatingUnits: "1000",
      limitUnits: "1000",
      ratioBps: 10_000,
      simulated: true,
      sources: ["simulated_custodian"],
      maxReserveAgeMs: fx.DAY,
    });
    expect(await loadReserveMonitorReport(h.db)).toEqual(report);

    // The mirror's status snapshot follows, for the rows events created.
    const [row] = await h.db
      .select()
      .from(reserveStatus)
      .where(eq(reserveStatus.representationId, "a"));
    expect(row?.chainRefreshedAt).toEqual(NOW);
    expect(row?.chainStatus?.state).toBe("ok");
  });

  it("reports a breach, and audits it once however many passes see it", async () => {
    const { monitor, chain, clock } = setup();
    chain.statuses.set("a", reserveStatusFixture({ state: "breached", ratio_bps: 9_000 }));
    chain.statuses.set("b", reserveStatusFixture());
    const first = await monitor.runOnce();
    expect(first.breaches).toEqual(["a"]);
    clock.now = new Date(NOW.getTime() + MINUTE);
    const second = await monitor.runOnce();
    expect(second.breaches).toEqual(["a"]);
    const audit = await h.db.select().from(auditLog).where(eq(auditLog.action, "reserve.breach"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: "reserve-monitor", subject: "a" });
    expect(audit[0]?.detail).toMatchObject({ state: "breached", ratioBps: 9_000, simulated: true });
  });

  it("audits staleness the first time it shows and a breach again after it cleared", async () => {
    const { monitor, chain } = setup();
    chain.statuses.set("a", reserveStatusFixture({ state: "stale", age_ms: fx.DAY + 1 }));
    chain.statuses.set("b", reserveStatusFixture());
    await monitor.runOnce();
    const audited = (action: string) =>
      h.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, action), eq(auditLog.subject, "a")));
    expect(await audited("reserve.stale")).toHaveLength(1);
    chain.statuses.set("a", reserveStatusFixture());
    await monitor.runOnce();
    chain.statuses.set("a", reserveStatusFixture({ state: "breached" }));
    await monitor.runOnce();
    expect(await audited("reserve.breach")).toHaveLength(2);
  });

  it("keeps going when one call or read fails, and says which", async () => {
    const { monitor, chain, signer } = setup();
    signer.failing.add("refresh_supply:a");
    chain.statuses.set("a", reserveStatusFixture());
    chain.failing.add("b");
    const report = await monitor.runOnce();
    expect(signer.calls).toContain("evaluate_reserve:a");
    expect(report.failed).toEqual(["a", "b"]);
    expect(report.entries[0]).toMatchObject({
      refreshedSupply: false,
      evaluated: true,
      state: "ok",
    });
    expect(report.entries[0]?.error).toContain("refresh_supply: Error: tx failed");
    expect(report.entries[1]).toMatchObject({
      state: null,
      error: expect.stringContaining("get_reserve_status"),
    });
  });

  it("only reads when no signer is configured", async () => {
    const chain = new FakeReserveChain();
    chain.statuses.set("a", reserveStatusFixture());
    chain.statuses.set("b", reserveStatusFixture());
    const report = await new ReserveMonitor({ db: h.db, chain, now: () => NOW }).runOnce();
    expect(report.signer).toBeNull();
    expect(report.entries.map((e) => [e.refreshedSupply, e.evaluated])).toEqual([
      [false, false],
      [false, false],
    ]);
    expect(report.failed).toEqual([]);
  });

  it("runs on an interval, survives a failed pass and stops on abort", async () => {
    const { monitor } = setup();
    const controller = new AbortController();
    const runOnce = vi
      .spyOn(monitor, "runOnce")
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue({
        ranAt: NOW.toISOString(),
        signer: null,
        simulated: true,
        source: "reserve_monitor",
        entries: [],
        breaches: [],
        stale: [],
        failed: [],
      });
    const errors: string[] = [];
    let waits = 0;
    await runReserveMonitor({
      monitor,
      intervalMs: 60_000,
      signal: controller.signal,
      log: { info() {}, error: (m) => errors.push(m) },
      sleep: async () => {
        if (++waits === 3) controller.abort();
      },
    });
    expect(runOnce).toHaveBeenCalledTimes(3);
    expect(errors).toEqual(["reserve monitor failed; will retry"]);
    expect(silent.errors).toEqual([]);
  });
});
