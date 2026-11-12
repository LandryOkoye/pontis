// Upserts the off-chain asset profiles of the demo catalogue into Postgres (ADR 0015). Needs only
// DATABASE_URL and DEPLOYER_ACCOUNT_ID (to name the token contracts); it never touches the chain.
// Run it after `pnpm --filter @pontis/api start` has migrated the database. Safe to repeat.
//
//   DATABASE_URL=postgres://... DEPLOYER_ACCOUNT_ID=you.testnet pnpm --filter @pontis/scripts seed-profiles [--catalogue=mvp|demo|full]
//
// The tier (default demo) must be the one the chain was seeded with.

import { createDb } from "@pontis/db";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "./lib/evidence.ts";
import { catalogueFor, tierFromArgs } from "./lib/catalogue-tiers.ts";
import { buildProfiles, seedProfiles } from "./lib/seed-profiles.ts";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const deployerId = process.env.DEPLOYER_ACCOUNT_ID?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!deployerId) throw new Error("DEPLOYER_ACCOUNT_ID is required");
  const { db, pool } = createDb(databaseUrl);
  try {
    const tier = tierFromArgs(process.argv.slice(2), "demo");
    const rows = buildProfiles(deployerId, REPO_ROOT, catalogueFor(tier));
    const written = rows.length === 0 ? 0 : await seedProfiles(db, rows);
    console.log(
      `upserted ${written} asset profiles of the ${tier} tier (source simulated_feed, simulated true)`,
    );
  } finally {
    await pool.end();
  }
}
