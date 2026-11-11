// The custody data of a catalogue tier (`--catalogue=mvp|demo|full`), attached by id to the
// catalogue of scripts/lib/catalogue-tiers.ts. `mvp` has none: the end-to-end suite seeds only the
// MVP pair and must not change. Fiction throughout (catalogue-custody-types.ts).

import { CUSTODIANS } from "./catalogue-custody-custodians.ts";
import { includesTier, type PlannedCustodian } from "./catalogue-custody-types.ts";
import type { CatalogueTier } from "./catalogue-tiers.ts";

export interface CustodyData {
  custodians: readonly PlannedCustodian[];
}

export function custodyFor(tier: CatalogueTier): CustodyData {
  const keep = <T extends { tier: "demo" | "full" }>(items: readonly T[]) =>
    items.filter((i) => includesTier(tier, i.tier));
  return { custodians: keep(CUSTODIANS) };
}
