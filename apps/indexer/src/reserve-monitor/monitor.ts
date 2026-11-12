// The reserve monitor (ADR 0020 section 5 and 10). Supply changes without an event the contract can
// act on, and staleness changes with time, so once a minute the monitor asks the contract to
// re-read each monitored token's supply (`refresh_supply`) and recompute its status
// (`evaluate_reserve`), both permissionless 1 yocto calls, then reads `get_reserve_status` and
// stores what it saw. It decides nothing: the contract computes the status from signed
// attestations and its own counters, and the route gate recomputes from the clock regardless of
// whether this job runs. Without a signer it only reads. Testnet and sandbox only.

import {
  auditLog,
  loadReserveMonitorReport,
  reservePolicies,
  reserveStatus,
  storeReserveMonitorReport,
  type Db,
  type ReserveMonitorEntry,
  type ReserveMonitorReport,
} from "@pontis/db";
import { eq } from "drizzle-orm";
import type { ReserveChain } from "../chain-views.ts";
import type { Logger } from "../indexer.ts";
import { sleep as realSleep } from "../retry.ts";

/** Sends 1 yoctoNEAR function calls to the core contract and resolves once they have executed. */
export interface MonitorSigner {
  readonly accountId: string;
  call(
    method: "refresh_supply" | "evaluate_reserve",
    args: { representation_id: string },
  ): Promise<void>;
}

export interface ReserveMonitorOptions {
  db: Db;
  chain: ReserveChain;
  /** Absent means read-only: statuses are read and reported, nothing is sent. */
  signer?: MonitorSigner | undefined;
  now?: () => Date;
}

export class ReserveMonitor {
  constructor(private readonly options: ReserveMonitorOptions) {}

  async runOnce(): Promise<ReserveMonitorReport> {
    const { db, chain, signer } = this.options;
    const now = (this.options.now ?? (() => new Date()))();
    const previous = await loadReserveMonitorReport(db);
    const policies = await db
      .select()
      .from(reservePolicies)
      .orderBy(reservePolicies.representationId);

    const entries: ReserveMonitorEntry[] = [];
    for (const policy of policies) {
      const rep = policy.representationId;
      const entry: ReserveMonitorEntry = {
        representationId: rep,
        state: null,
        action: policy.action,
        attestedUnits: null,
        circulatingUnits: null,
        limitUnits: null,
        ratioBps: null,
        ageMs: null,
        maxReserveAgeMs: policy.maxReserveAgeMs,
        refreshedSupply: false,
        evaluated: false,
        simulated: true,
        sources: [],
        error: null,
      };
      const problems: string[] = [];
      if (signer) {
        // Each step is its own try: a failed supply read must not stop the evaluation, which
        // recomputes from the last stored read and from the clock.
        try {
          await signer.call("refresh_supply", { representation_id: rep });
          entry.refreshedSupply = true;
        } catch (error) {
          problems.push(`refresh_supply: ${String(error)}`);
        }
        try {
          await signer.call("evaluate_reserve", { representation_id: rep });
          entry.evaluated = true;
        } catch (error) {
          problems.push(`evaluate_reserve: ${String(error)}`);
        }
      }
      try {
        const status = await chain.reserveStatus(rep);
        // A monitored representation reads `ok`, `breached`, `stale` or `no_attestation`.
        entry.state = status.state === "unmonitored" ? null : status.state;
        entry.action = status.action ?? policy.action;
        entry.attestedUnits = status.attested_units;
        entry.circulatingUnits = status.circulating_units;
        entry.limitUnits = status.limit_units;
        entry.ratioBps = status.ratio_bps;
        entry.ageMs = status.age_ms;
        entry.simulated = status.simulated;
        entry.sources = status.sources;
        await db
          .update(reserveStatus)
          .set({
            chainStatus: status,
            chainRefreshedAt: now,
            simulated: status.simulated,
            sources: status.sources,
          })
          .where(eq(reserveStatus.representationId, rep));
      } catch (error) {
        problems.push(`get_reserve_status: ${String(error)}`);
      }
      entry.error = problems.length > 0 ? problems.join("; ") : null;
      entries.push(entry);
    }

    const report: ReserveMonitorReport = {
      ranAt: now.toISOString(),
      signer: signer?.accountId ?? null,
      simulated: true,
      source: "reserve_monitor",
      entries,
      breaches: entries.filter((e) => e.state === "breached").map((e) => e.representationId),
      stale: entries.filter((e) => e.state === "stale").map((e) => e.representationId),
      failed: entries.filter((e) => e.error !== null).map((e) => e.representationId),
    };
    await storeReserveMonitorReport(db, report);
    await this.recordNewProblems(previous, report);
    return report;
  }

  /** A breach or staleness that was not in the previous pass goes to the audit log once. */
  private async recordNewProblems(
    previous: ReserveMonitorReport | undefined,
    report: ReserveMonitorReport,
  ): Promise<void> {
    const rows = [
      ...report.breaches
        .filter((id) => !previous?.breaches.includes(id))
        .map((id) => ({ action: "reserve.breach", id })),
      ...report.stale
        .filter((id) => !previous?.stale.includes(id))
        .map((id) => ({ action: "reserve.stale", id })),
    ];
    if (rows.length === 0) return;
    await this.options.db.insert(auditLog).values(
      rows.map(({ action, id }) => {
        const entry = report.entries.find((e) => e.representationId === id);
        return {
          actor: "reserve-monitor",
          action,
          subject: id,
          detail: {
            state: entry?.state ?? null,
            attestedUnits: entry?.attestedUnits ?? null,
            circulatingUnits: entry?.circulatingUnits ?? null,
            ratioBps: entry?.ratioBps ?? null,
            simulated: entry?.simulated ?? true,
            ranAt: report.ranAt,
          },
        };
      }),
    );
  }
}

export interface RunReserveMonitorOptions {
  monitor: ReserveMonitor;
  intervalMs: number;
  signal: AbortSignal;
  log: Logger;
  sleep?: (ms: number) => Promise<void>;
}

/** Runs the monitor until `signal` aborts; a failed pass is logged and retried next interval. */
export async function runReserveMonitor(options: RunReserveMonitorOptions): Promise<void> {
  const { monitor, intervalMs, signal, log } = options;
  const wait = options.sleep ?? ((ms: number) => realSleep(ms, signal));
  while (!signal.aborted) {
    try {
      const report = await monitor.runOnce();
      if (report.breaches.length + report.stale.length + report.failed.length > 0)
        log.info("reserve monitor", {
          breaches: report.breaches,
          stale: report.stale,
          failed: report.failed,
        });
    } catch (error) {
      log.error("reserve monitor failed; will retry", { error: String(error) });
    }
    await wait(intervalMs);
  }
}
