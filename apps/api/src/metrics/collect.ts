// Builds the metric responses. One snapshot feeds the public view, the admin view and the
// Prometheus text, so they cannot disagree.

import {
  METRIC_WINDOWS,
  type AdminMetrics,
  type Metric,
  type MetricBreakdown,
  type ProtocolMetrics,
} from "@pontis/api-types";
import { assetRepresentations, quotes, type Db } from "@pontis/db";
import { asc, eq, or } from "drizzle-orm";
import { CATALOGUE, type MetricDef } from "./catalogue.ts";
import {
  conversionSuccessRate,
  refundRate,
  requiresReconciliationMeanTimeToResolve,
  requiresReconciliationOpen,
  requiresReconciliationRate,
} from "./conversion-health.ts";
import type { Computed, ComputedBreakdown, MetricsContext } from "./core.ts";
import {
  indexerHeartbeatAge,
  indexerLagBlocks,
  quoteToSettleLatency,
  submitToSettleLatencyP95,
} from "./latency.ts";
import {
  assetsRegistered,
  chainsLive,
  directEquivalentRoutesLive,
  issuersActive,
  representationsActive,
} from "./routes.ts";
import { assetsThirdPartyAttestedPct } from "./trust.ts";
import { feesCollected, vaultInventory, volumeInput } from "./volume.ts";

export interface MetricsDeps {
  db: Db;
  /** Latest chain head; may reject, which makes `indexer_lag_blocks` null. */
  chainHeight: () => Promise<number>;
  now: () => Date;
}

const COMPUTE: Record<string, (ctx: MetricsContext, deps: MetricsDeps) => Promise<Computed>> = {
  conversion_success_rate: conversionSuccessRate,
  refund_rate: refundRate,
  requires_reconciliation_rate: requiresReconciliationRate,
  requires_reconciliation_open: requiresReconciliationOpen,
  requires_reconciliation_mean_time_to_resolve_seconds: requiresReconciliationMeanTimeToResolve,
  quote_to_settle_latency_seconds_p50: (ctx) => quoteToSettleLatency(ctx, "0.5"),
  quote_to_settle_latency_seconds_p95: (ctx) => quoteToSettleLatency(ctx, "0.95"),
  submit_to_settle_latency_seconds_p95: submitToSettleLatencyP95,
  indexer_lag_blocks: (ctx, deps) => indexerLagBlocks(ctx, deps.chainHeight),
  indexer_heartbeat_age_seconds: indexerHeartbeatAge,
  routes_direct_equivalent_live: directEquivalentRoutesLive,
  assets_registered: assetsRegistered,
  representations_active: representationsActive,
  issuers_active: issuersActive,
  chains_live: chainsLive,
  assets_third_party_attested_pct: assetsThirdPartyAttestedPct,
};

const COMPUTE_BREAKDOWN: Record<string, (ctx: MetricsContext) => Promise<ComputedBreakdown>> = {
  volume_input_base_units: volumeInput,
  fees_collected_base_units: feesCollected,
  vault_inventory_base_units: vaultInventory,
};

/** True when a quote involves a synthetic representation (every quote of the testnet deployment). */
async function anyQuoteSynthetic(db: Db): Promise<boolean> {
  const rows = await db
    .select({ one: quotes.id })
    .from(quotes)
    .innerJoin(
      assetRepresentations,
      or(eq(assetRepresentations.id, quotes.fromId), eq(assetRepresentations.id, quotes.toId)),
    )
    .where(eq(assetRepresentations.synthetic, true))
    .limit(1);
  return rows.length > 0;
}

/** IDs of the quotes waiting for a person, oldest first (admin only). */
async function openRequiresReconciliationIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: quotes.id })
    .from(quotes)
    .where(eq(quotes.state, "REQUIRES_RECONCILIATION"))
    .orderBy(asc(quotes.updatedAt), asc(quotes.id));
  return rows.map((r) => r.id);
}

const withNote = (def: MetricDef) => (def.note ? { note: def.note } : {});

async function metric(def: MetricDef, ctx: MetricsContext, deps: MetricsDeps): Promise<Metric> {
  const head = { key: def.key, unit: def.unit, scope: def.scope, ...withNote(def) };
  const compute = COMPUTE[def.key];
  if (def.availableFrom !== undefined || !compute) {
    return { ...head, available: false, availableFrom: def.availableFrom ?? "not implemented" };
  }
  const c = await compute(ctx, deps);
  return {
    ...head,
    available: true,
    simulated: c.simulated,
    ...(c.values ? { values: c.values } : { value: c.value ?? null }),
  };
}

async function breakdown(def: MetricDef, ctx: MetricsContext): Promise<MetricBreakdown> {
  const compute = COMPUTE_BREAKDOWN[def.key];
  if (!compute) throw new Error(`no breakdown computed for ${def.key}`);
  const c = await compute(ctx);
  return {
    key: def.key,
    unit: "base_units",
    scope: def.scope,
    simulated: c.simulated,
    ...withNote(def),
    ...(c.values ? { values: c.values } : { value: c.value ?? {} }),
  };
}

async function context(deps: MetricsDeps): Promise<MetricsContext> {
  return { db: deps.db, now: deps.now(), tradingSynthetic: await anyQuoteSynthetic(deps.db) };
}

/** The public view: aggregates only, for the keys the spec tags P. */
export async function protocolMetrics(deps: MetricsDeps): Promise<ProtocolMetrics> {
  const ctx = await context(deps);
  const defs = CATALOGUE.filter((d) => d.audience === "public");
  return {
    asOf: ctx.now.toISOString(),
    windows: [...METRIC_WINDOWS],
    metrics: await Promise.all(defs.map((d) => metric(d, ctx, deps))),
  };
}

/** The admin view: every key, per-representation amounts and the open quote IDs. */
export async function adminMetrics(deps: MetricsDeps): Promise<AdminMetrics> {
  const ctx = await context(deps);
  const [metrics, breakdowns, requiresReconciliationQuoteIds] = await Promise.all([
    Promise.all(CATALOGUE.filter((d) => !d.breakdown).map((d) => metric(d, ctx, deps))),
    Promise.all(CATALOGUE.filter((d) => d.breakdown).map((d) => breakdown(d, ctx))),
    openRequiresReconciliationIds(deps.db),
  ]);
  return {
    asOf: ctx.now.toISOString(),
    windows: [...METRIC_WINDOWS],
    metrics,
    breakdowns,
    requiresReconciliationQuoteIds,
  };
}
