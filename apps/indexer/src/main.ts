// Indexer process: migrate, then follow the chain until stopped.

import { createDb, runMigrations } from "@pontis/db";
import { RpcClient, RpcTxVerifier } from "@pontis/near-client";
import { loadConfig } from "./config.ts";
import { runIndexer, type Logger } from "./indexer.ts";
import { NearChainSource } from "./near-source.ts";
import { nearVaultChain } from "./reconcile/near-vault-chain.ts";
import { Reconciler, runReconciler } from "./reconcile/reconciler.ts";

const config = loadConfig();
const log: Logger = {
  info: (message, fields) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);

const rpc = new RpcClient({ url: config.NEAR_RPC_URL, timeoutMs: 20_000 });
const source = new NearChainSource(rpc, config.PONTIS_CORE_ACCOUNT_ID, {
  concurrency: config.INDEXER_CHUNK_CONCURRENCY,
});

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

log.info("indexer started", {
  core: config.PONTIS_CORE_ACCOUNT_ID,
  rpc: config.NEAR_RPC_URL,
  startHeight: config.INDEXER_START_HEIGHT ?? "chain head",
});
const reconciling =
  config.RECONCILE_INTERVAL_MS > 0
    ? runReconciler({
        reconciler: new Reconciler({
          db,
          chain: nearVaultChain(rpc, config.PONTIS_CORE_ACCOUNT_ID),
          coreId: config.PONTIS_CORE_ACCOUNT_ID,
          stuckAfterMs: config.RECONCILE_STUCK_AFTER_MS,
          lookbackMs: config.RECONCILE_LOOKBACK_MS,
        }),
        intervalMs: config.RECONCILE_INTERVAL_MS,
        signal: controller.signal,
        log,
      })
    : undefined;
await runIndexer({
  db,
  source,
  verifier: new RpcTxVerifier(rpc),
  coreId: config.PONTIS_CORE_ACCOUNT_ID,
  log,
  startHeight: config.INDEXER_START_HEIGHT,
  pollMs: config.INDEXER_POLL_MS,
  rescanBlocks: config.INDEXER_RESCAN_BLOCKS,
  signal: controller.signal,
});
await reconciling;
await pool.end();
log.info("indexer stopped");
