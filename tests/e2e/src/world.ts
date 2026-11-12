// Brings up everything the scenario needs: a chain (a fresh local sandbox, or NEAR Testnet), the
// contracts deployed and seeded, a throwaway database, and the API and indexer as real processes.

import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { deploy } from "../../../scripts/deploy-testnet.ts";
import { connect, type Chain } from "../../../scripts/lib/chain.ts";
import { loadConfig, type ChainConfig } from "../../../scripts/lib/config.ts";
import { targets, wasmPath } from "../../../scripts/lib/deploy-plan.ts";
import { seed } from "../../../scripts/seed-testnet.ts";
import { ApiClient } from "./api.ts";
import { start, waitFor, type Managed } from "./processes.ts";
import { startSandbox } from "./sandbox.ts";

export const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

export interface World {
  /** `sandbox` (default) is a fresh local chain; `testnet` uses the deployment in the environment. */
  mode: "sandbox" | "testnet";
  chain: Chain;
  config: ChainConfig;
  api: ApiClient;
  /** The throwaway database the API and the indexer use, for assertions on the indexer's mirror. */
  pool: TestDb["pool"];
  logDir: string;
  stop(): Promise<void>;
}

export async function startWorld(): Promise<World> {
  const mode = process.env.E2E_MODE === "testnet" ? "testnet" : "sandbox";
  const logDir = mkdtempSync(join(tmpdir(), "pontis-e2e-"));
  const cleanups: (() => Promise<void>)[] = [];
  const stop = async () => {
    for (const cleanup of cleanups.reverse()) await cleanup().catch(() => undefined);
  };
  try {
    console.log(`mode: ${mode}; logs: ${logDir}`);
    let env: Record<string, string | undefined> = process.env;
    if (mode === "sandbox") {
      const { info, process: sandbox } = await startSandbox(REPO_ROOT, logDir);
      cleanups.push(() => sandbox.stop());
      env = {
        ...process.env,
        NEAR_NETWORK_ID: "sandbox",
        NEAR_RPC_URL: info.rpcUrl,
        DEPLOYER_ACCOUNT_ID: info.accountId,
        DEPLOYER_PRIVATE_KEY: info.secretKey,
      };
    }
    const config = loadConfig(env);
    const chain = connect(config);

    for (const target of targets(config.deployerId, {
      core: config.coreId,
      a: config.tokenAId,
      b: config.tokenBId,
    })) {
      if (!existsSync(wasmPath(target.wasm))) {
        throw new Error(
          `missing ${wasmPath(target.wasm)}: build the contracts first (scripts/build-contracts.sh slim)`,
        );
      }
    }
    process.env.DEPLOYMENTS_FILE = join(logDir, "deployments.md");
    await deploy(chain, false);
    const seeded = await seed(chain, {
      ...(process.env.QUOTE_SIGNER_SECRET_KEY
        ? { quoteSignerSecretKey: process.env.QUOTE_SIGNER_SECRET_KEY }
        : {}),
    });
    const signerKey = seeded.generatedQuoteSignerSecretKey ?? process.env.QUOTE_SIGNER_SECRET_KEY;
    if (!signerKey)
      throw new Error(
        "the contract already has a quote signer: set QUOTE_SIGNER_SECRET_KEY to its key",
      );

    const database = await createTestDb();
    cleanups.push(() => database.drop());

    const port = Number(process.env.E2E_API_PORT ?? 3099);
    const adminKey = randomBytes(24).toString("hex");
    const common = {
      DATABASE_URL: database.url,
      NEAR_RPC_URL: config.rpcUrl,
      NEAR_NETWORK_ID: config.networkId,
      PONTIS_CORE_ACCOUNT_ID: config.coreId,
    };
    const processes: Managed[] = [
      start("api", "pnpm", ["--filter", "@pontis/api", "start"], {
        cwd: REPO_ROOT,
        logDir,
        env: {
          ...common,
          PORT: String(port),
          HOST: "127.0.0.1",
          QUOTE_SIGNER_SECRET_KEY: signerKey,
          ADMIN_API_KEY: adminKey,
          REGISTRY_SYNC_INTERVAL_MS: "2000",
          // The expiry scenario needs an accepted quote marked EXPIRED before its transfer lands.
          QUOTE_SWEEP_INTERVAL_MS: "1000",
          // The run polls far more than a person would.
          RATE_LIMIT_READ: "100000",
          RATE_LIMIT_WRITE: "100000",
          RATE_LIMIT_ADMIN: "100000",
        },
      }),
      start("indexer", "pnpm", ["--filter", "@pontis/indexer", "start"], {
        cwd: REPO_ROOT,
        logDir,
        env: {
          ...common,
          // A shared public RPC rate limits; a faster reconciler would starve the indexer.
          RECONCILE_INTERVAL_MS: mode === "sandbox" ? "5000" : "30000",
          RECONCILE_STUCK_AFTER_MS: "60000",
        },
      }),
    ];
    for (const p of processes) cleanups.push(() => p.stop());

    const api = new ApiClient(`http://127.0.0.1:${port}`, adminKey);
    await waitFor(
      "the API, the indexer and the first registry sync",
      async () => {
        const health = await api.get("/v1/health");
        const body = health.body as { status?: string; indexerLagBlocks?: number | null };
        if (health.status !== 200 || body.status !== "ok") return false;
        if (body.indexerLagBlocks === undefined || body.indexerLagBlocks === null) return false;
        const assets = (await api.get("/v1/assets")).body as { items?: unknown[] };
        return (assets.items?.length ?? 0) >= 2;
      },
      { timeoutMs: 120_000 },
    );
    return { mode, chain, config, api, pool: database.pool, logDir, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
