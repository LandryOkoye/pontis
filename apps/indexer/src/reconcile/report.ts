// Persisting a run: the latest report is one row the admin endpoint serves; findings that appear
// for the first time are also written to the audit log.

import type { ReconciliationFinding, ReconciliationRun } from "@pontis/api-types";
import { auditLog, reconciliationReport, type Db } from "@pontis/db";
import { eq } from "drizzle-orm";
import type { Candidate } from "./finding.ts";

export const REPORT_NAME = "latest";

export async function loadRun(db: Db): Promise<ReconciliationRun | undefined> {
  const [row] = await db
    .select()
    .from(reconciliationReport)
    .where(eq(reconciliationReport.name, REPORT_NAME));
  return row?.report;
}

/** Candidates with the time the problem was first seen: kept from the previous run when it persists. */
export function withFirstSeen(
  candidates: readonly Candidate[],
  previous: ReconciliationRun | undefined,
  now: Date,
): ReconciliationFinding[] {
  const before = new Map(previous?.findings.map((f) => [f.key, f.firstSeenAt]));
  return candidates.map((c) => ({ ...c, firstSeenAt: before.get(c.key) ?? now.toISOString() }));
}

export async function storeRun(
  db: Db,
  run: ReconciliationRun,
  previous: ReconciliationRun | undefined,
): Promise<void> {
  const known = new Set(previous?.findings.map((f) => f.key));
  await db.transaction(async (tx) => {
    await tx
      .insert(reconciliationReport)
      .values({ name: REPORT_NAME, report: run })
      .onConflictDoUpdate({
        target: reconciliationReport.name,
        set: { report: run, updatedAt: new Date(run.ranAt) },
      });
    const added = run.findings.filter((f) => !known.has(f.key));
    if (added.length > 0) {
      await tx.insert(auditLog).values(
        added.map((f) => ({
          actor: "reconciler",
          action: "reconciliation.finding",
          subject: f.subject,
          detail: { key: f.key, kind: f.kind, severity: f.severity, message: f.message },
        })),
      );
    }
  });
}
