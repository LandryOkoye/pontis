// GET /v1/admin/reserve-monitor: the indexer monitor's latest pass (ADR 0020 section 10), as the
// indexer stored it in `reserve_monitor_report`. The API adds nothing: the contract computes each
// reserve status and the monitor only reads it and calls the permissionless refresh methods.

import type { ReserveMonitorReport } from "@pontis/api-types";
import { loadReserveMonitorReport, type Db } from "@pontis/db";

const NOTICE =
  "Simulated test figures from fictional custodians. The monitor decides nothing: the contract computes each status from signed attestations and its own supply counters.";

export async function getReserveMonitorReport(db: Db): Promise<ReserveMonitorReport> {
  const report = await loadReserveMonitorReport(db);
  const base = { simulated: true, source: "reserve_monitor", notice: NOTICE } as const;
  if (!report) {
    return {
      status: "NEVER_RUN",
      ranAt: null,
      signer: null,
      entries: [],
      breaches: [],
      stale: [],
      failed: [],
      ...base,
    };
  }
  const attention =
    report.breaches.length > 0 || report.stale.length > 0 || report.failed.length > 0;
  return {
    status: attention ? "ATTENTION" : "OK",
    ranAt: new Date(report.ranAt).toISOString(),
    signer: report.signer,
    entries: report.entries,
    breaches: report.breaches,
    stale: report.stale,
    failed: report.failed,
    ...base,
  };
}
