// The admin view of reconciliation: the reconciler's last run plus every quote waiting for a person.

import type { ReconciliationReport } from "@pontis/api-types";
import { conversions, quotes, reconciliationReport, type Db } from "@pontis/db";
import { asc, eq } from "drizzle-orm";

const LATEST = "latest";

export async function getReconciliationReport(db: Db): Promise<ReconciliationReport> {
  const [stored] = await db
    .select()
    .from(reconciliationReport)
    .where(eq(reconciliationReport.name, LATEST));
  const flagged = await db
    .select({ quote: quotes, conversion: conversions })
    .from(quotes)
    .leftJoin(conversions, eq(conversions.quoteId, quotes.id))
    .where(eq(quotes.state, "REQUIRES_RECONCILIATION"))
    .orderBy(asc(quotes.updatedAt));
  const requiresReconciliation = flagged.map(({ quote, conversion }) => ({
    quoteId: quote.id,
    conversionId: conversion?.id ?? null,
    reason: conversion?.failureReason ?? null,
    flaggedAt: quote.updatedAt.toISOString(),
  }));
  const run = stored?.report;
  const attention = (run?.findings.length ?? 0) > 0 || requiresReconciliation.length > 0;
  return {
    status: !run ? "NEVER_RUN" : attention ? "ATTENTION" : "OK",
    ranAt: run?.ranAt ?? null,
    findings: run?.findings ?? [],
    vaults: run?.vaults ?? [],
    requiresReconciliation,
  };
}
