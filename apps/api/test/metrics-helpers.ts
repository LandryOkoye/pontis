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

/** Every key of docs/success-metrics.md, sections 1 to 7. */
export const SPEC_KEYS = `conversion_success_rate refund_rate requires_reconciliation_rate
requires_reconciliation_open requires_reconciliation_mean_time_to_resolve_seconds
quote_to_settle_latency_seconds_p50 quote_to_settle_latency_seconds_p95
submit_to_settle_latency_seconds_p95 indexer_lag_blocks indexer_heartbeat_age_seconds
routes_direct_equivalent_live routes_market_priced_live assets_registered representations_active
issuers_active chains_live volume_input_base_units volume_usd fees_collected_base_units fees_usd
vault_inventory_base_units tvl_usd lp_utilisation lp_net_apy bridge_transfers_initiated
bridge_transfers_completed bridge_time_to_finality_seconds_median bridge_failure_rate
bridge_refund_rate bridge_value_at_risk_in_flight_usd assets_third_party_attested_pct
assets_fresh_reserve_attestation_pct reserve_coverage_ratio parity_deviation_bps_max
parity_deviation_bps_median circuit_breaker_trips`.split(/\s+/);
