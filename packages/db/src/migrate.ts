import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client.ts";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies pending migrations; safe to run on every start. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
