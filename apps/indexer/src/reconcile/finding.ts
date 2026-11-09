// A finding before it has a first-seen time: what a check found this run.

import type { FindingSeverity, ReconciliationKind } from "@pontis/domain";

export interface Candidate {
  /** Stable across runs for the same problem, so a persisting finding keeps its first-seen time. */
  key: string;
  kind: ReconciliationKind;
  severity: FindingSeverity;
  subject: string;
  message: string;
}
