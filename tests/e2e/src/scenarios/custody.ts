// Phase 4 end to end (ADR 0020): custody, reserves, the gated mint and redemption, run through the
// real indexer and API against the real contract. Custodian and issuer back-office are the dev-key
// simulators of `scripts reserves` and `scripts backoffice`: every figure is SIMULATED and nothing
// is custodied, backed, audited or paid out.

import { join } from "node:path";
import { section } from "../steps.ts";
import type { World } from "../world.ts";
import { breachScenario } from "./custody-breach.ts";
import { mintScenario } from "./custody-mint.ts";
import { reservesScenario } from "./custody-reserves.ts";

export async function custody(world: World): Promise<void> {
  section("Custody, reserves, mint gate and redemption (simulated)");
  // The simulator's drift state is a file; keep this run's out of the repository's.
  process.env.RESERVES_STATE_FILE = join(world.logDir, "reserves-state.json");
  const kit = await reservesScenario(world);
  await mintScenario(world, kit);
  await breachScenario(world, kit);
}
