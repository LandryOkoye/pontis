// Bulk inserts for the market jobs: a whole batch travels as one JSON parameter and is unpacked by
// the database (`jsonb_to_recordset`), instead of one bind parameter per cell. A drizzle
// `.values()` of 5,000 rows builds and sends about 40,000 parameters, which costs more than the
// insert itself; the JSON form is about twice as fast for the 1.4 million price points of a full
// 90-day backfill, and writes the same rows.

import type { Db } from "@pontis/db";
import { sql, type SQL } from "drizzle-orm";

export interface BulkColumn {
  /** The column's SQL name, which is also the key of each row object. */
  name: string;
  /** Its SQL type: `text`, `timestamptz`, `numeric`, `boolean`, `integer` or `jsonb`. */
  type: string;
}

/**
 * Inserts `rows` (objects keyed by column name, JSON-serialisable) into `table` and returns the
 * rows the database wrote. `onConflict` is the whole conflict clause, for example
 * `sql\`ON CONFLICT DO NOTHING\``. `table` and the columns are code constants, never user input.
 */
export async function bulkInsert(
  db: Db,
  table: string,
  columns: readonly BulkColumn[],
  rows: readonly object[],
  onConflict: SQL,
): Promise<number> {
  if (rows.length === 0) return 0;
  const names = sql.join(
    columns.map((c) => sql.identifier(c.name)),
    sql`, `,
  );
  const definitions = sql.join(
    columns.map((c) => sql`${sql.identifier(c.name)} ${sql.raw(c.type)}`),
    sql`, `,
  );
  const result = await db.execute(
    sql`INSERT INTO ${sql.identifier(table)} (${names}) SELECT ${names} FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS t(${definitions}) ${onConflict}`,
  );
  return result.rowCount ?? 0;
}
