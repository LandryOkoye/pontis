// Reserve checks (ADR 0020 section 5). The contract computes a monitored representation's status
// from signed attestations and its own supply counters; the mirror records the transitions it was
// told about. Two things are worth a finding: a breach the mirror has not recorded (an event was
// missed, or the indexer is behind), and attestations older than the policy allows (nothing emits
// an event when time passes, so only a read of the status shows it).

import { reservePolicies, reserveStatus, type Db } from "@pontis/db";
import type { ReserveChain } from "../chain-views.ts";
import type { Candidate } from "./finding.ts";

export interface ReserveCandidates {
  /** Breaches the mirror does not show; the reconciler confirms them over two runs. */
  breaches: Candidate[];
  stale: Candidate[];
}

const minutes = (ms: number) => Math.floor(ms / 60_000);

export async function reserveCandidates(db: Db, chain: ReserveChain): Promise<ReserveCandidates> {
  const policies = await db
    .select({ representationId: reservePolicies.representationId })
    .from(reservePolicies)
    .orderBy(reservePolicies.representationId);
  const mirrored = new Map(
    (await db.select().from(reserveStatus)).map((r) => [r.representationId, r.state]),
  );
  const found: ReserveCandidates = { breaches: [], stale: [] };
  for (const { representationId: rep } of policies) {
    const status = await chain.reserveStatus(rep);
    if (status.state === "breached" && mirrored.get(rep) !== "breached") {
      const ratio =
        status.ratio_bps === null ? "no ratio" : `${(status.ratio_bps / 100).toFixed(2)}% cover`;
      found.breaches.push({
        key: `reserve:${rep}:breach`,
        kind: "RESERVE_BREACH",
        severity: "critical",
        subject: rep,
        message: `The contract reports ${rep} breached (${status.circulating_units} circulating against a limit of ${status.limit_units}, ${ratio}, simulated reserves) but the mirror records ${mirrored.get(rep) ?? "no status"}`,
      });
    }
    if (status.state === "stale") {
      found.stale.push({
        key: `reserve:${rep}:stale`,
        kind: "RESERVE_STALE",
        severity: "warning",
        subject: rep,
        message: `The oldest attestation of ${rep} is ${minutes(status.age_ms ?? 0)} min old; the policy allows ${minutes(status.max_reserve_age_ms)} min`,
      });
    }
  }
  return found;
}
