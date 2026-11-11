// Seeds the demo catalogue on a deployed pontis-core: four simulated issuers in different trust
// states, six canonical assets, eight representations, two relationships, starting supply,
// allowlist and vault inventory. Run the MVP seed first (`seed`), and deploy the catalogue tokens
// with `deploy-testnet --catalogue`. Every step reads current state first, so re-running is safe.
//
//   pnpm --filter @pontis/scripts seed-catalogue
//
// ALLOWLIST_ACCOUNTS (comma-separated) is allowlisted on every catalogue representation too.

import { pathToFileURL } from "node:url";
import { assertDeployerKey, connect, type Chain } from "./lib/chain.ts";
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
  await seedCatalogueOnChain(connect(loadConfig()), extra ? { allowlist: extra } : {});
}
