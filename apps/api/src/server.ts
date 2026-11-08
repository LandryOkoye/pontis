// API process: migrate, start the HTTP server and the background registry sync, stop cleanly.

import { CoreClient, RpcClient, TokenClient } from "@pontis/near-client";
import { parseSecretKey } from "@pontis/quote-engine";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { syncRegistry } from "./sync/registry-sync.ts";
import { expireQuotes } from "./quotes/lifecycle.ts";
import { startScheduler } from "./sync/scheduler.ts";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);

const rpc = new RpcClient({ url: config.NEAR_RPC_URL });
const core = new CoreClient(rpc, config.PONTIS_CORE_ACCOUNT_ID);
const key = parseSecretKey(config.QUOTE_SIGNER_SECRET_KEY);
const app = buildApp({
  db,
  chainHeight: () => core.blockHeight(),
  quotes: { chain: core, key, coreId: config.PONTIS_CORE_ACCOUNT_ID },
  conversionChain: {
    isRegistered: async (tokenId, account) =>
      (await new TokenClient(rpc, tokenId).storageBalanceOf(account)) !== null,
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
