// Corporate actions (ADR 0017): an approved action with a multiplier change is applied by each
// live wrapper once it is effective. One that stays unapplied past a grace period is overdue.

import { assetRepresentations, type Db } from "@pontis/db";
import type { ChainCorporateAction } from "@pontis/near-client";
import type { Candidate } from "./finding.ts";

/** An approved action is overdue once it has been effective this long (10 minutes). */
export const ACTION_OVERDUE_AFTER_MS = 600_000;

/** The chain read the action check needs; `CoreClient` provides it. */
export interface ActionChain {
  corporateActions(assetId: string): Promise<ChainCorporateAction[]>;
}

export interface LiveWrappers {
  assetId: string;
  representationIds: string[];
}

/** Live wrappers per canonical asset: representations that are neither rejected nor deprecated. */
export async function readLiveWrappers(db: Db): Promise<LiveWrappers[]> {
  const reps = await db
    .select({
      id: assetRepresentations.id,
      assetId: assetRepresentations.canonicalAssetId,
      status: assetRepresentations.status,
    })
    .from(assetRepresentations)
    .orderBy(assetRepresentations.id);
  const byAsset = new Map<string, string[]>();
  for (const rep of reps) {
    if (rep.status === "rejected" || rep.status === "deprecated") continue;
    byAsset.set(rep.assetId, [...(byAsset.get(rep.assetId) ?? []), rep.id]);
  }
  return [...byAsset].map(([assetId, representationIds]) => ({ assetId, representationIds }));
}

/** One finding per overdue action, naming the wrappers that have not applied it. */
export async function actionCandidates(
  chain: ActionChain,
  assets: readonly LiveWrappers[],
  now: Date,
): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (const { assetId, representationIds } of assets) {
    for (const action of await chain.corporateActions(assetId)) {
      if (action.status !== "approved" || action.multiplier_change === null) continue;
      const overdueMs = now.getTime() - action.effective_ms;
      if (overdueMs <= ACTION_OVERDUE_AFTER_MS) continue;
      const missing = representationIds.filter(
        (id) => !action.applied_representations.includes(id),
      );
      if (missing.length === 0) continue;
      found.push({
        key: `action:${action.id}:overdue`,
        kind: "CORPORATE_ACTION_OVERDUE",
        severity: "warning",
        subject: action.id,
        message: `Action ${action.id} on ${assetId} took effect ${Math.floor(overdueMs / 60_000)} min ago and ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} not applied it`,
      });
    }
  }
  return found;
}
