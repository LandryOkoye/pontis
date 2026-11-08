import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.ts";

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema, casing: "snake_case" });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];

/** The handle inside `db.transaction(async (tx) => ...)`. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
