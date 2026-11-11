// Seeds the demo catalogue on a deployed pontis-core: simulated issuers in different trust states,
// canonical assets, representations, relationships (some guarded), starting supply, allowlist and
// vault inventory. Run the MVP seed first (`seed`), and deploy the catalogue tokens of the same
// tier with `deploy-testnet --catalogue=<tier>`. Every step reads current state first, so
// re-running is safe.
//
//   pnpm --filter @pontis/scripts seed-catalogue [--catalogue=mvp|demo|full]    (default demo)
//
// ALLOWLIST_ACCOUNTS (comma-separated) is allowlisted on every catalogue representation too.

import { pathToFileURL } from "node:url";
import { assertDeployerKey, connect, type Chain } from "./lib/chain.ts";
import { tierFromArgs } from "./lib/catalogue-tiers.ts";
import { loadConfig } from "./lib/config.ts";
import { seedCatalogue, type CatalogueSeedOptions } from "./lib/seed-catalogue.ts";

export async function seedCatalogueOnChain(
  chain: Chain,
  options: CatalogueSeedOptions = {},
): Promise<void> {
  await assertDeployerKey(chain);
  await seedCatalogue(chain, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const extra = process.env.ALLOWLIST_ACCOUNTS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await seedCatalogueOnChain(connect(loadConfig()), {
    tier: tierFromArgs(process.argv.slice(2), "demo"),
    ...(extra ? { allowlist: extra } : {}),
  });
}
