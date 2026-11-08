import { createDb } from "./client.ts";
import { runMigrations } from "./migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const { db, pool } = createDb(url);
await runMigrations(db);
await pool.end();
console.log("migrations applied");
