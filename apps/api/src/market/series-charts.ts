// NAV and supply charts: observation series carried forward bucket by bucket (ADR 0015).

import type { NavChart, SupplyChart } from "@pontis/api-types";
import { navPoints, supplySnapshots, type Db } from "@pontis/db";
import { INTERVAL_MS, formatPrice, parsePrice, type DataFilter } from "@pontis/domain";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { envelope, type ChartRange } from "./charts.ts";

interface Observation {
  ts: number;
  simulated: boolean;
  value: bigint;
}

/**
 * For each bucket the last observation before the bucket ends, carried forward; `filled` marks
 * buckets with no observation of their own. Buckets before the first observation are omitted.
 */
function carry(observations: readonly Observation[], range: ChartRange) {
  const size = INTERVAL_MS[range.interval];
  const sorted = [...observations].sort((a, b) => a.ts - b.ts);
  const points: { t: string; simulated: boolean; value: bigint; filled: boolean }[] = [];
  let i = 0;
  let last: Observation | undefined;
  for (let start = range.fromMs; start < range.toMs; start += size) {
    let own = false;
    while (i < sorted.length && (sorted[i] as Observation).ts < start + size) {
      last = sorted[i];
      own = (sorted[i] as Observation).ts >= start;
      i++;
    }
    if (last) {
      points.push({
        t: new Date(start).toISOString(),
        simulated: last.simulated,
        value: last.value,
        filled: !own,
      });
    }
  }
  return points;
}

/**
 * Every row of a series in the range plus the newest row before it, so the first bucket can carry a
 * value in. Rows come back oldest first.
 */
async function observationsIn<T extends typeof navPoints | typeof supplySnapshots>(
  db: Db,
  table: T,
  idColumn: T["representationId"],
  tsColumn: T["ts"],
  id: string,
  range: ChartRange,
): Promise<T["$inferSelect"][]> {
  const from = new Date(range.fromMs);
  const inRange = await db
    .select()
    .from(table as typeof navPoints)
    .where(and(eq(idColumn, id), gte(tsColumn, from), lt(tsColumn, new Date(range.toMs))))
    .orderBy(asc(tsColumn));
  const [before] = await db
    .select()
    .from(table as typeof navPoints)
    .where(and(eq(idColumn, id), lt(tsColumn, from)))
    .orderBy(desc(tsColumn))
    .limit(1);
  return (before ? [before, ...inRange] : inRange) as T["$inferSelect"][];
}

/** Series-level choice: `all` uses the real series when one exists, else the simulated one. */
function chooseClass<T extends { simulated: boolean }>(
  rows: readonly T[],
  filter: DataFilter,
): T[] {
  if (filter === "real") return rows.filter((r) => !r.simulated);
  if (filter === "simulated") return rows.filter((r) => r.simulated);
  const real = rows.filter((r) => !r.simulated);
  return real.length > 0 ? real : [...rows];
}

export async function navChart(
  db: Db,
  id: string,
  range: ChartRange,
  filter: DataFilter,
): Promise<NavChart> {
  const rows = chooseClass(
    await observationsIn(db, navPoints, navPoints.representationId, navPoints.ts, id, range),
    filter,
  );
  const points = carry(
    rows.map((r) => ({ ts: r.ts.getTime(), simulated: r.simulated, value: parsePrice(r.nav) })),
    range,
  );
  return {
    ...envelope(id, range, points),
    filledPoints: points.filter((p) => p.filled).length,
    points: points.map((p) => ({
      t: p.t,
      simulated: p.simulated,
      nav: formatPrice(p.value),
      filled: p.filled,
    })),
  };
}

export async function supplyChart(
  db: Db,
  id: string,
  range: ChartRange,
  filter: DataFilter,
): Promise<SupplyChart> {
  const rows = chooseClass(
    await observationsIn(
      db,
      supplySnapshots,
      supplySnapshots.representationId,
      supplySnapshots.ts,
      id,
      range,
    ),
    filter,
  );
  // Sum the latest snapshot of every chain as of each snapshot time.
  const times = [...new Set(rows.map((r) => r.ts.getTime()))].sort((a, b) => a - b);
  const latest = new Map<string, bigint>();
  const observations: Observation[] = [];
  for (const ts of times) {
    for (const r of rows.filter((x) => x.ts.getTime() === ts))
      latest.set(r.chain, BigInt(r.supply));
    const sample = rows.find((r) => r.ts.getTime() === ts) as (typeof rows)[number];
    observations.push({
      ts,
      simulated: sample.simulated,
      value: [...latest.values()].reduce((a, b) => a + b, 0n),
    });
  }
  const points = carry(observations, range);
  return {
    ...envelope(id, range, points),
    filledPoints: points.filter((p) => p.filled).length,
    points: points.map((p) => ({
      t: p.t,
      simulated: p.simulated,
      supply: p.value.toString(),
      filled: p.filled,
    })),
  };
}
