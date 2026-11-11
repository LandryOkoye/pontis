// The reserve monitor's latest pass (ADR 0020 section 10): one row the indexer writes and
// `GET /v1/admin/reserve-monitor` is meant to serve. The API endpoint is deferred to the RBAC task;
// `loadReserveMonitorReport` is the query it should call.

import { eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { reserveMonitorReport, type ReserveMonitorReport } from "./schema/custody.ts";

export const RESERVE_MONITOR_REPORT_NAME = "latest";

/** The monitor's latest pass, or `undefined` when it has never run. */
export async function loadReserveMonitorReport(db: Db): Promise<ReserveMonitorReport | undefined> {
  const [row] = await db
    .select()
    .from(reserveMonitorReport)
    .where(eq(reserveMonitorReport.name, RESERVE_MONITOR_REPORT_NAME));
  return row?.report;
}

export async function storeReserveMonitorReport(
  db: Db,
  report: ReserveMonitorReport,
): Promise<void> {
  await db
    .insert(reserveMonitorReport)
    .values({ name: RESERVE_MONITOR_REPORT_NAME, report })
    .onConflictDoUpdate({
      target: reserveMonitorReport.name,
      set: { report, updatedAt: new Date(report.ranAt) },
    });
}
