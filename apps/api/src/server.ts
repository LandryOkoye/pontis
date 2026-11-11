// API process: verify the RPC network, migrate, start the HTTP server and the background registry sync, stop cleanly.
// `API_MODE=fixtures` skips all of that and serves the example data instead (fixtures-app.ts).

import { CoreClient, RpcClient, RpcTxVerifier, TokenClient } from "@pontis/near-client";
import { rpcAuthChain } from "./auth/types.ts";
import { parseSecretKey } from "@pontis/quote-engine";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { verifyStartup } from "./startup.ts";
import { createDb } from "@pontis/db";
import { runMigrations } from "@pontis/db";
import { syncRegistry } from "./sync/registry-sync.ts";
import { expireQuotes } from "./quotes/lifecycle.ts";
import { startScheduler } from "./sync/scheduler.ts";

if (process.env.API_MODE === "fixtures") {
  const { buildFixturesApp } = await import("./fixtures-app.ts");
  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());
  const app = buildFixturesApp({ corsOrigins: origins });
  console.warn(
    JSON.stringify({
      level: "warn",
      message: "API_MODE=fixtures: serving example data, not the chain",
    }),
  );
  await app.listen({ host: process.env.HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
  await new Promise<void>((resolve) => process.once("SIGINT", resolve).once("SIGTERM", resolve));
  await app.close();
  process.exit(0);
}

const config = loadConfig();
const rpc = new RpcClient({ url: config.NEAR_RPC_URL });
// Before the database is touched or a port opened: a wrong RPC URL must stop the process.
await verifyStartup(config, rpc, (message, fields) =>
  console.log(JSON.stringify({ level: "info", message, ...fields })),
);
const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);

const core = new CoreClient(rpc, config.PONTIS_CORE_ACCOUNT_ID);
const key = parseSecretKey(config.QUOTE_SIGNER_SECRET_KEY);
const app = buildApp({
  db,
  chainHeight: () => core.blockHeight(),
  health: {
    staleAfterMs: config.INDEXER_STALE_AFTER_MS,
    maxLagBlocks: config.INDEXER_MAX_LAG_BLOCKS,
  },
  quotes: { chain: core, key, coreId: config.PONTIS_CORE_ACCOUNT_ID },
  actionsChain: core,
  conversionChain: {
    isRegistered: async (tokenId, account) =>
      (await new TokenClient(rpc, tokenId).storageBalanceOf(account)) !== null,
  },
  txVerifier: new RpcTxVerifier(rpc),
  auth: {
    chain: rpcAuthChain(rpc, core),
    recipient: config.AUTH_RECIPIENT ?? `pontis-api.${config.NEAR_NETWORK_ID}`,
    networkId: config.NEAR_NETWORK_ID,
  },
  ...(config.ADMIN_API_KEY ? { adminApiKey: config.ADMIN_API_KEY } : {}),
  security: {
    corsOrigins: config.CORS_ORIGIN,
    trustProxy: config.TRUST_PROXY,
    rateLimits: {
      read: config.RATE_LIMIT_READ,
      write: config.RATE_LIMIT_WRITE,
      admin: config.RATE_LIMIT_ADMIN,
      windowMs: config.RATE_LIMIT_WINDOW_MS,
    },
  },
  logger: true,
});
const sync =
  config.REGISTRY_SYNC_INTERVAL_MS > 0
    ? startScheduler({
        run: () => syncRegistry(db, core),
        intervalMs: config.REGISTRY_SYNC_INTERVAL_MS,
        onError: (err) => app.log.error({ err }, "registry sync failed"),
      })
    : undefined;

core.getQuoteSigner().then(
  (onChain) => {
    if (onChain !== key.publicKey)
      app.log.warn(
        { onChain, configured: key.publicKey },
        "quote signer on-chain differs from the configured key: quotes will be rejected",
      );
  },
  (err: unknown) => app.log.warn({ err }, "could not read the on-chain quote signer"),
);
const sweep = startScheduler({
  run: () => expireQuotes(db, new Date()),
  intervalMs: config.QUOTE_SWEEP_INTERVAL_MS,
  onError: (err) => app.log.error({ err }, "quote expiry sweep failed"),
});

await app.listen({ host: config.HOST, port: config.PORT });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void (async () => {
      await sync?.stop();
      await sweep.stop();
      await app.close();
      await pool.end();
    })();
  });
}
