// The reconciler (BuildPlan B13): compares what the database believes with what the chain says,
// flags what it cannot explain, and stores a report for the admin endpoint.

import type { ReconciliationRun } from "@pontis/api-types";
import { auditLog, conversions, quotes, type Db } from "@pontis/db";
import { and, eq } from "drizzle-orm";
import type { Logger } from "../indexer.ts";
import { sleep as realSleep } from "../retry.ts";
import type { Candidate } from "./finding.ts";
import { loadRun, storeRun, withFirstSeen } from "./report.ts";
import { settlementCandidates, stuckCandidate, stuckQuotes } from "./settlement-checks.ts";
import { actionCandidates, readLiveWrappers, type ActionChain } from "./actions.ts";
import type { ReserveChain } from "../chain-views.ts";
import { escrowCandidates, mirroredEscrow, overdueRedemptions } from "./redemptions.ts";
import { reserveCandidates } from "./reserves.ts";
import { readVaults, vaultCandidates, type VaultChain } from "./vaults.ts";

export interface ReconcilerOptions {
  db: Db;
  chain: VaultChain & ActionChain & ReserveChain;
  coreId: string;
  /** A submitted quote with no outcome event after this long is flagged. */
  stuckAfterMs: number;
  /** Settlement consistency is checked for quotes touched this recently. */
  lookbackMs: number;
  now?: () => Date;
}

export class Reconciler {
  // Vault findings must show in two consecutive runs: the core's inventory and its token balance
  // are separate reads and a conversion in flight moves them at different blocks.
  private vaultSuspects = new Set<string>();
  // The same holds for reserve breaches and escrow: the mirror trails the chain by a few blocks.
  private breachSuspects = new Set<string>();
  private escrowSuspects = new Set<string>();

  constructor(private readonly options: ReconcilerOptions) {}

  /** Moves stuck `SUBMITTED` quotes to `REQUIRES_RECONCILIATION`. */
  private async flagStuck(now: Date): Promise<void> {
    const { db, stuckAfterMs } = this.options;
    const minutes = Math.round(stuckAfterMs / 60_000);
    for (const { quote, conversion } of await stuckQuotes(db, now, stuckAfterMs)) {
      if (quote.state !== "SUBMITTED") continue;
      const reason = stuckCandidate(quote.id, minutes).message;
      await db.transaction(async (tx) => {
        const moved = await tx
          .update(quotes)
          .set({ state: "REQUIRES_RECONCILIATION", updatedAt: now })
          .where(and(eq(quotes.id, quote.id), eq(quotes.state, "SUBMITTED")))
          .returning({ id: quotes.id });
        if (moved.length === 0) return;
        await tx
          .update(conversions)
          .set({ failureReason: reason })
          .where(eq(conversions.id, conversion.id));
        await tx.insert(auditLog).values({
          actor: "reconciler",
          action: "quote.requires_reconciliation",
          subject: quote.id,
          detail: { kind: "STUCK_SUBMITTED", reason, reportedTxHash: conversion.reportedTxHash },
        });
      });
    }
  }

  async runOnce(): Promise<ReconciliationRun> {
    const { db, chain, coreId, stuckAfterMs, lookbackMs } = this.options;
    const now = (this.options.now ?? (() => new Date()))();
    await this.flagStuck(now);

    const minutes = Math.round(stuckAfterMs / 60_000);
    const stuck = (await stuckQuotes(db, now, stuckAfterMs)).map((r) =>
      stuckCandidate(r.quote.id, minutes),
    );
    const settlement = await settlementCandidates(db, new Date(now.getTime() - lookbackMs));
    const { readings: vaults, escrowHeld } = await readVaults(db, chain, coreId);
    const suspects = vaultCandidates(vaults);
    const confirmed = suspects.filter((c) => this.vaultSuspects.has(c.key));
    this.vaultSuspects = new Set(suspects.map((c) => c.key));

    const actions = await actionCandidates(chain, await readLiveWrappers(db), now);

    const reserves = await reserveCandidates(db, chain);
    const confirmedBreaches = reserves.breaches.filter((c) => this.breachSuspects.has(c.key));
    this.breachSuspects = new Set(reserves.breaches.map((c) => c.key));

    const escrow = escrowCandidates(
      vaults,
      escrowHeld,
      await mirroredEscrow(db),
      new Set(suspects.map((c) => c.subject)),
    );
    const confirmedEscrow = escrow.filter((c) => this.escrowSuspects.has(c.key));
    this.escrowSuspects = new Set(escrow.map((c) => c.key));
    const overdue = await overdueRedemptions(db, now);

    const previous = await loadRun(db);
    const candidates: Candidate[] = [
      ...stuck,
      ...settlement,
      ...confirmed,
      ...actions,
      ...confirmedBreaches,
      ...reserves.stale,
      ...overdue,
      ...confirmedEscrow,
    ];
    const run: ReconciliationRun = {
      ranAt: now.toISOString(),
      findings: withFirstSeen(candidates, previous, now),
      vaults,
    };
    await storeRun(db, run, previous);
    return run;
  }
}

export interface RunReconcilerOptions {
  reconciler: Reconciler;
  intervalMs: number;
  signal: AbortSignal;
  log: Logger;
  sleep?: (ms: number) => Promise<void>;
}

/** Runs the reconciler until `signal` aborts; a failed run is logged and retried next interval. */
export async function runReconciler(options: RunReconcilerOptions): Promise<void> {
  const { reconciler, intervalMs, signal, log } = options;
  const wait = options.sleep ?? ((ms: number) => realSleep(ms, signal));
  while (!signal.aborted) {
    try {
      const run = await reconciler.runOnce();
      if (run.findings.length > 0)
        log.info("reconciliation findings", { count: run.findings.length });
    } catch (error) {
      log.error("reconciliation failed; will retry", { error: String(error) });
    }
    await wait(intervalMs);
  }
}
