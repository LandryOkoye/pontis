// One command that loads a local demo: deploys and seeds the registry (the MVP pair plus the chosen
// catalogue tier), writes the off-chain asset profiles and a simulated market into Postgres, so the
// API, directory and charts have something to show. Everything it writes is synthetic and labelled.
//
//   pnpm demo:seed [--catalogue=mvp|demo|full] --sandbox-info <file> [--days 90] [--no-market]
//
// `--sandbox-info` is the JSON the sandbox writes (see tests/e2e/src/sandbox.ts: PONTIS_SANDBOX_INFO
// of `cargo test -p pontis-integration-tests --test serve_sandbox -- --ignored --nocapture`).
// Without it the target is the network in the environment, and a public testnet needs `--testnet`
// because the deploy spends testnet NEAR (`pnpm --filter @pontis/scripts catalogue-plan` prices it).
// The market steps need DATABASE_URL. Every step reads current state first, so repeating it is safe.

import { KeyPair } from "near-api-js";
import { createDb } from "@pontis/db";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deploy } from "./deploy-testnet.ts";
import { seedCatalogueOnChain } from "./seed-catalogue.ts";
import { seed } from "./seed-testnet.ts";
import { connect } from "./lib/chain.ts";
import { catalogueFor } from "./lib/catalogue-tiers.ts";
import { loadConfig } from "./lib/config.ts";
import { parseDemoSeedArgs, runStep, type DemoSeedOptions } from "./lib/demo-seed.ts";
import { REPO_ROOT } from "./lib/evidence.ts";
import { buildProfiles, seedProfiles } from "./lib/seed-profiles.ts";

interface SandboxInfo {
  rpcUrl: string;
  accountId: string;
  secretKey: string;
}

function targetEnv(options: DemoSeedOptions): Record<string, string | undefined> {
  if (!options.sandboxInfo) return process.env;
  const info = JSON.parse(readFileSync(options.sandboxInfo, "utf8")) as SandboxInfo;
  // The committed deployment record describes Testnet; a sandbox run writes its own.
  process.env.DEPLOYMENTS_FILE ??= join(tmpdir(), "pontis-demo-deployments.md");
  return {
    ...process.env,
    NEAR_NETWORK_ID: "sandbox",
    NEAR_RPC_URL: info.rpcUrl,
    DEPLOYER_ACCOUNT_ID: info.accountId,
    DEPLOYER_PRIVATE_KEY: info.secretKey,
  };
}

export async function demoSeed(options: DemoSeedOptions): Promise<void> {
  const config = loadConfig(targetEnv(options));
  if (config.networkId === "testnet" && !options.testnet) {
    throw new Error(
      "the target is a public testnet: pass --testnet to spend its NEAR, or --sandbox-info",
    );
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (options.market && !databaseUrl)
    throw new Error("DATABASE_URL is required (or pass --no-market)");
  const chain = connect(config);
  const extra = process.env.ALLOWLIST_ACCOUNTS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`target ${config.networkId} ${config.rpcUrl}; catalogue tier ${options.tier}`);
  await deploy(chain, false, { catalogue: options.tier });
  const seeded = await seed(chain, extra ? { allowlist: extra } : {});
  await seedCatalogueOnChain(chain, { tier: options.tier, ...(extra ? { allowlist: extra } : {}) });
  if (seeded.generatedQuoteSignerSecretKey) {
    console.log(
      `\nGenerated quote-signer key (the only copy; keep it for the API):\nQUOTE_SIGNER_SECRET_KEY=${seeded.generatedQuoteSignerSecretKey}`,
    );
  }
  if (!options.market || !databaseUrl) return;

  const chainEnv = {
    DATABASE_URL: databaseUrl,
    NEAR_NETWORK_ID: config.networkId,
    NEAR_RPC_URL: config.rpcUrl,
    PONTIS_CORE_ACCOUNT_ID: config.coreId,
  };
  // The registry sync reads the chain only; the API config still requires a signer key, which the
  // sync never uses, so a throwaway one is enough when the real one is not at hand.
  const signer =
    seeded.generatedQuoteSignerSecretKey ??
    process.env.QUOTE_SIGNER_SECRET_KEY ??
    KeyPair.fromRandom("ed25519").toString();
  runStep("mirror the registry into Postgres", ["--filter", "@pontis/api", "sync"], {
    ...chainEnv,
    QUOTE_SIGNER_SECRET_KEY: signer,
  });

  const { db, pool } = createDb(databaseUrl);
  try {
    const rows = buildProfiles(config.deployerId, REPO_ROOT, catalogueFor(options.tier));
    const written = rows.length === 0 ? 0 : await seedProfiles(db, rows);
    console.log(`\n== upserted ${written} asset profiles (source simulated_feed, simulated true)`);
  } finally {
    await pool.end();
  }
  runStep(
    `simulate ${options.days} days of market history`,
    ["--filter", "@pontis/simulator", "start", "backfill"],
    { ...chainEnv, SIM_BACKFILL_DAYS: String(options.days) },
  );
  console.log("\ndemo loaded: every price, NAV, supply and trade written above is simulated.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await demoSeed(parseDemoSeedArgs(process.argv.slice(2)));
}
