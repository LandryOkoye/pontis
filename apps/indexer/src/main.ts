// Indexer process: verify the RPC network, migrate, then follow the chain until stopped.

import { createDb, runMigrations } from "@pontis/db";
import { RpcClient, RpcTxVerifier, redactRpcUrl } from "@pontis/near-client";
import { loadConfig } from "./config.ts";
import { runIndexer, type Logger } from "./indexer.ts";
import { verifyStartup } from "./startup.ts";
import { NearChainSource } from "./near-source.ts";
import { nearVaultChain } from "./reconcile/near-vault-chain.ts";
import { runMarketJobs } from "./market-jobs.ts";
import { Reconciler, runReconciler } from "./reconcile/reconciler.ts";
import { CustodyViews } from "./chain-views.ts";
import { ReserveMonitor, runReserveMonitor } from "./reserve-monitor/monitor.ts";
import { nearMonitorSigner } from "./reserve-monitor/near-signer.ts";

const config = loadConfig();
const log: Logger = {
  info: (message, fields) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

const rpc = new RpcClient({ url: config.NEAR_RPC_URL, timeoutMs: 20_000 });
// Before the database is touched: a wrong RPC URL must stop the process.
await verifyStartup(config, rpc, log.info);

const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);

const source = new NearChainSource(rpc, config.PONTIS_CORE_ACCOUNT_ID, {
  concurrency: config.INDEXER_CHUNK_CONCURRENCY,
});

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

log.info("indexer started", {
  core: config.PONTIS_CORE_ACCOUNT_ID,
  network: config.NEAR_NETWORK_ID,
  rpc: redactRpcUrl(config.NEAR_RPC_URL),
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
const marketJobs =
  config.MARKET_JOBS_INTERVAL_MS > 0
    ? runMarketJobs({
        db,
        intervalMs: config.MARKET_JOBS_INTERVAL_MS,
        windowMs: config.MARKET_JOBS_WINDOW_MS,
        signal: controller.signal,
        log,
      })
    : undefined;
const custody = new CustodyViews(rpc, config.PONTIS_CORE_ACCOUNT_ID);
const monitoring =
  config.RESERVE_MONITOR_INTERVAL_MS > 0
    ? runReserveMonitor({
        monitor: new ReserveMonitor({
          db,
          chain: custody,
          signer:
            config.RESERVE_MONITOR_ACCOUNT_ID && config.RESERVE_MONITOR_PRIVATE_KEY
              ? nearMonitorSigner({
                  rpcUrl: config.NEAR_RPC_URL,
                  coreId: config.PONTIS_CORE_ACCOUNT_ID,
                  accountId: config.RESERVE_MONITOR_ACCOUNT_ID,
                  privateKey: config.RESERVE_MONITOR_PRIVATE_KEY,
                })
              : undefined,
        }),
        intervalMs: config.RESERVE_MONITOR_INTERVAL_MS,
        signal: controller.signal,
        log,
      })
    : undefined;
await runIndexer({
  db,
  source,
  mirror: custody,
  verifier: new RpcTxVerifier(rpc),
  coreId: config.PONTIS_CORE_ACCOUNT_ID,
  log,
  startHeight: config.INDEXER_START_HEIGHT,
  pollMs: config.INDEXER_POLL_MS,
  rescanBlocks: config.INDEXER_RESCAN_BLOCKS,
  signal: controller.signal,
});
await reconciling;
await marketJobs;
await monitoring;
await pool.end();
log.info("indexer stopped");
