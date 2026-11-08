// Seeds a deployed pontis-core with the MVP registry (ADR 0001, 0009): issuers, claim, two
// representations, evidence, a DIRECT_EQUIVALENT relationship, the quote signer, allowlist and a
// funded vault. Every step reads current state first, so re-running it is safe.
//
//   pnpm --filter @pontis/scripts seed

import { pathToFileURL } from "node:url";
import { assertDeployerKey, connect, type Chain } from "./lib/chain.ts";
import { loadConfig } from "./lib/config.ts";
import { seedOps, type SeedOptions, type SeedResult } from "./lib/seed-ops.ts";
import { seedRegistry } from "./lib/seed-registry.ts";

export async function seed(chain: Chain, options: SeedOptions = {}): Promise<SeedResult> {
  await assertDeployerKey(chain);
  await seedRegistry(chain);
  return seedOps(chain, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const extra = process.env.ALLOWLIST_ACCOUNTS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const { generatedQuoteSignerSecretKey } = await seed(connect(config), {
    ...(process.env.QUOTE_SIGNER_SECRET_KEY
      ? { quoteSignerSecretKey: process.env.QUOTE_SIGNER_SECRET_KEY }
      : {}),
    ...(extra ? { allowlist: extra } : {}),
  });
  if (generatedQuoteSignerSecretKey) {
    console.log(
      `\nGenerated quote-signer key. Put it in apps/api/.env and never commit it:\nQUOTE_SIGNER_SECRET_KEY=${generatedQuoteSignerSecretKey}`,
    );
  }
}
