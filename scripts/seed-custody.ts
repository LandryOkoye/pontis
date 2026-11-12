// Seeds the fictional custody, reserve and redemption data of a catalogue tier on a deployed
// pontis-core (docs/runbooks/seed-demo.md). Run `seed` and `seed-catalogue` of the same tier first.
// SIMULATED: nothing is custodied, backed, audited, regulated or paid out. Every step reads current
// state first, so re-running is safe.
//
//   pnpm --filter @pontis/scripts seed-custody [--catalogue=mvp|demo|full]    (default demo)

import { pathToFileURL } from "node:url";
import { assertDeployerKey, connect, type Chain } from "./lib/chain.ts";
import { tierFromArgs } from "./lib/catalogue-tiers.ts";
import { loadConfig } from "./lib/config.ts";
import { seedCustody, type CustodySeedOptions } from "./lib/seed-custody.ts";

export async function seedCustodyOnChain(
  chain: Chain,
  options: CustodySeedOptions = {},
): Promise<void> {
  await assertDeployerKey(chain);
  await seedCustody(chain, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seedCustodyOnChain(connect(loadConfig()), {
    tier: tierFromArgs(process.argv.slice(2), "demo"),
  });
}
