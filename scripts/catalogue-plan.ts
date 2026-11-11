// Prints what a catalogue tier contains and what it costs to put on a chain (NEAR, transactions,
// estimated time), without a chain, a database or a key. The token wasm size is read from the
// built `synthetic_token.wasm` when it exists (scripts/build-contracts.sh), else the slim-build
// size from docs/architecture/deployments.md is used.
//
//   pnpm --filter @pontis/scripts catalogue-plan [--catalogue=mvp|demo|full]    (default: all three)

import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { catalogueCost, renderCost, SLIM_TOKEN_WASM_BYTES } from "./lib/catalogue-cost.ts";
import { TIERS, tierFromArgs } from "./lib/catalogue-tiers.ts";
import { wasmPath } from "./lib/deploy-plan.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const tiers = args.some((a) => a.startsWith("--catalogue"))
    ? [tierFromArgs(args, "demo")]
    : TIERS;
  const wasm = wasmPath("synthetic_token");
  const bytes = existsSync(wasm) ? statSync(wasm).size : SLIM_TOKEN_WASM_BYTES;
  console.log(
    `token wasm: ${bytes} bytes (${existsSync(wasm) ? wasm : "slim-build size from docs/architecture/deployments.md"})`,
  );
  for (const tier of tiers) console.log(`\n${renderCost(catalogueCost(tier, bytes))}`);
}
