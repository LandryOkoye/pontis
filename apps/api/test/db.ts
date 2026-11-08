// Each test file gets its own throwaway database, so files run in parallel without sharing rows.
// Needs a Postgres reachable at DATABASE_URL (default: docker-compose.yml, `pnpm db:up`).

import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDb, type Db } from "../src/db/client.ts";
import { runMigrations } from "../src/db/migrate.ts";

const BASE_URL = process.env.DATABASE_URL ?? "postgres://pontis:pontis@localhost:5432/pontis";

export interface TestDb {
  db: Db;
  pool: pg.Pool;
  drop(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const name = `pontis_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: BASE_URL });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Postgres is not reachable at ${BASE_URL}; run \`pnpm db:up\` or set DATABASE_URL`,
      { cause: error },
    );
  }
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(BASE_URL);
  url.pathname = `/${name}`;
  const { db, pool } = createDb(url.toString());
  await runMigrations(db);
  return {
    db,
    pool,
    async drop() {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
