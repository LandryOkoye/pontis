// `start backfill` writes history; `start run` keeps the simulated market moving.
// Everything it writes is flagged simulated. It needs a registry mirror (the API sync) to know what to simulate.

import { createDb, runMigrations } from "@pontis/db";
import { loadConfig } from "./config.ts";
import { backfill, tick } from "./simulate.ts";

const config = loadConfig();
const command = process.argv[2];
if (command !== "backfill" && command !== "run") {
  console.error("usage: simulator <backfill|run>");
  process.exit(2);
}

const log = (message: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ level: "info", message, simulated: true, ...fields }));

const { db, pool } = createDb(config.DATABASE_URL);
await runMigrations(db);
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());

try {
  if (command === "backfill") {
    log("backfill", {
      ...(await backfill(db, Date.now(), config.SIM_BACKFILL_DAYS, config.PONTIS_CORE_ACCOUNT_ID)),
    });
  } else {
    log("run started", { tickMs: config.SIM_TICK_MS });
    while (!controller.signal.aborted) {
      try {
        log("tick", { ...(await tick(db, Date.now(), config.PONTIS_CORE_ACCOUNT_ID)) });
      } catch (error) {
        console.error(
          JSON.stringify({ level: "error", message: "tick failed", error: String(error) }),
        );
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, config.SIM_TICK_MS);
        controller.signal.addEventListener(
          "abort",
          () => (clearTimeout(timer), resolve(undefined)),
          {
            once: true,
          },
        );
      });
    }
  }
} finally {
  await pool.end();
}
