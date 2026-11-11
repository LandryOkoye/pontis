// The custody data of a catalogue tier (`--catalogue=mvp|demo|full`), attached by id to the
// catalogue of scripts/lib/catalogue-tiers.ts. `mvp` has none: the end-to-end suite seeds only the
// MVP pair and must not change. Fiction throughout (catalogue-custody-types.ts).

import { CUSTODIANS } from "./catalogue-custody-custodians.ts";
import { DEMO_CUSTODY } from "./catalogue-custody-reps.ts";
import { FULL_CUSTODY } from "./catalogue-custody-reps-full.ts";
import {
  includesTier,
  type PlannedCustodian,
  type PlannedCustody,
} from "./catalogue-custody-types.ts";
import type { CatalogueTier } from "./catalogue-tiers.ts";

export interface CustodyData {
  custodians: readonly PlannedCustodian[];
  /** Custody link and reserve policy per representation; a representation absent here has no custody. */
  custody: readonly PlannedCustody[];
}

export function custodyFor(tier: CatalogueTier): CustodyData {
  const keep = <T extends { tier: "demo" | "full" }>(items: readonly T[]) =>
    items.filter((i) => includesTier(tier, i.tier));
  return { custodians: keep(CUSTODIANS), custody: keep([...DEMO_CUSTODY, ...FULL_CUSTODY]) };
}

/** The one-line custody counts a tier prints in `catalogue-plan`. */
export function custodySummary(tier: CatalogueTier): string {
  const { custodians, custody } = custodyFor(tier);
  const stories = new Map<string, number>();
  for (const c of custody) stories.set(c.story, (stories.get(c.story) ?? 0) + 1);
  const told = [...stories].map(([story, n]) => `${n} ${story}`).join(", ") || "none";
  return `  custody (simulated): ${custodians.length} custodians, ${custody.length} linked representations (${told})`;
}
