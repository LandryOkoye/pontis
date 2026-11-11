// End-to-end run: catalog, quote, convert, index, refuse, reconcile. Sandbox by default (needs the
// built contracts, Docker Postgres and cargo); `E2E_MODE=testnet` runs against a real deployment.

import { catalog } from "./scenarios/catalog.ts";
import { conversion } from "./scenarios/conversion.ts";
import { reconciliation } from "./scenarios/reconciliation.ts";
import { stuckSubmission } from "./scenarios/stuck.ts";
import { replay } from "./scenarios/replay.ts";
import { expiry } from "./scenarios/expiry.ts";
import { history } from "./scenarios/history.ts";
import { guards } from "./scenarios/guards.ts";
import { refusals } from "./scenarios/refusals.ts";
import { suspension } from "./scenarios/suspension.ts";
import { startWorld } from "./world.ts";

const started = Date.now();
const world = await startWorld();
let failed = false;
try {
  await catalog(world);
  const settled = await conversion(world);
  await history(world, settled);
  await replay(world, settled);
  await refusals(world);
  if (world.mode === "sandbox") await suspension(world);
  // Started before the expiry wait so the two minutes overlap.
  const stuck = await stuckSubmission(world);
  await expiry(world);
  await reconciliation(world, settled, stuck);
  // Last: a guard changes what every later quote must satisfy.
  if (world.mode === "sandbox") await guards(world);
  console.log(`\nAll steps passed in ${Math.round((Date.now() - started) / 1000)}s.`);
} catch (error) {
  failed = true;
  console.error(
    `\nFailed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  console.error(`Logs of the API, indexer and sandbox: ${world.logDir}`);
} finally {
  await world.stop();
}
process.exit(failed ? 1 : 0);
