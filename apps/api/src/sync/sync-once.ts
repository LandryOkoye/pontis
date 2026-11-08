// One registry sync from the chain into Postgres, then exit: `pnpm --filter @pontis/api sync`.

import { CoreClient, RpcClient } from "@pontis/near-client";
import { loadConfig } from "../config.ts";
import { createDb } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";
import { syncRegistry } from "./registry-sync.ts";

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);
const core = new CoreClient(
  new RpcClient({ url: config.NEAR_RPC_URL }),
  config.PONTIS_CORE_ACCOUNT_ID,
);
console.log(await syncRegistry(db, core));
await pool.end();
