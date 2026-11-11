// The one-command local loader (`pnpm demo:seed`): its options and the child processes it runs.
// Pure apart from `runStep`, so the option parser and the step list are tested without a chain.

import { spawnSync } from "node:child_process";
import { optional, oneOf, split } from "./arg-parse.ts";
import { DEFAULT_TIER, tierFromArgs, type CatalogueTier } from "./catalogue-tiers.ts";
import { REPO_ROOT } from "./evidence.ts";

export interface DemoSeedOptions {
  tier: CatalogueTier;
  /** JSON file written by the sandbox (`rpcUrl`, `accountId`, `secretKey`); the sandbox is the target. */
  sandboxInfo: string | undefined;
  /** Allows a public testnet as the target: the deploy then spends real testnet NEAR. */
  testnet: boolean;
  /** Days of simulated history to write. */
  days: number;
  /** False skips the database steps (registry mirror, profiles, simulated market). */
  market: boolean;
}

export const DEMO_SEED_USAGE =
  "usage: demo:seed [--catalogue=mvp|demo|full] [--sandbox-info <file>] [--testnet] [--days <1-365>] [--no-market]";

export function parseDemoSeedArgs(argv: readonly string[]): DemoSeedOptions {
  const tier = tierFromArgs(argv, DEFAULT_TIER);
  const rest = split(
    argv.filter((a) => a !== "--catalogue" && !a.startsWith("--catalogue=")),
    ["sandbox-info", "days"],
    ["testnet", "no-market"],
  );
  if (rest.positionals.length > 0) throw new Error(DEMO_SEED_USAGE);
  const days = Number(optional(rest, "days") ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days must be 1 to 365");
  oneOf(tier, ["mvp", "demo", "full"], "--catalogue");
  return {
    tier,
    sandboxInfo: optional(rest, "sandbox-info"),
    testnet: rest.flags.has("testnet"),
    days,
    market: !rest.flags.has("no-market"),
  };
}

/** Runs `pnpm` in the repository root and throws when it fails. */
export function runStep(label: string, args: string[], env: Record<string, string>): void {
  console.log(`\n== ${label}`);
  const result = spawnSync("pnpm", args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status ?? "signal"})`);
}
