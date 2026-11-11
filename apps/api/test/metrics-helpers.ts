// Shared setup for the metrics tests: a clock, the fixture registry (tgold-a and tgold-b, both
// synthetic and active) and a query context.

import type { Db } from "@pontis/db";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { MetricsContext } from "../src/metrics/core.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";

export const NOW = new Date("2026-11-11T12:00:00Z");
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** An instant `ms` before `NOW`. */
export const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

export const seedRegistry = (db: Db) => syncRegistry(db, fixtureSource());

export const context = (db: Db, tradingSynthetic = true): MetricsContext => ({
  db,
  now: NOW,
  tradingSynthetic,
});
