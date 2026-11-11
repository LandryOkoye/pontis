// Every metric key of the spec (docs/success-metrics.md), in spec order, with the unit, scope,
// audience and the phase that unlocks it. The three endpoints are all built from this list, so a
// key cannot be served by one and missing from another.

import type { MetricUnit } from "@pontis/api-types";
import { LATER_PHASES } from "./later-phases.ts";

export interface MetricDef {
  /** The snake_case key; the Prometheus name is `pontis_<key>`. */
  key: string;
  unit: MetricUnit;
  scope: "window" | "now";
  /** `public`: in all three endpoints; `admin`: only in the admin view and Prometheus. */
  audience: "public" | "admin";
  /** One line for the Prometheus HELP text. */
  help: string;
  /** The phase that makes the metric computable; absent when it is computed today. */
  availableFrom?: string;
  /** How an ambiguous formula was read. */
  note?: string;
  /** Per-representation amounts: only in the admin `breakdowns` and Prometheus. */
  breakdown?: true;
}

/** Computed today from the registry mirror and the trading tables. */
const COMPUTED: readonly MetricDef[] = [
  {
    key: "conversion_success_rate",
    unit: "ratio",
    scope: "window",
    audience: "public",
    help: "Settled share of quotes that reached the chain (SETTLED, FAILED, REQUIRES_RECONCILIATION).",
    note: "Windowed by quotes.updated_at; expired and cancelled quotes are excluded.",
  },
  {
    key: "refund_rate",
    unit: "ratio",
    scope: "window",
    audience: "public",
    help: "Share of on-chain executions that returned the input (conversion_rejected or conversion_failed).",
    note: "Counts settlement events by block_timestamp, including events not linked to a conversion.",
  },
  {
    key: "requires_reconciliation_rate",
    unit: "ratio",
    scope: "window",
    audience: "public",
    help: "Quotes that entered REQUIRES_RECONCILIATION per executed quote.",
    note: "Numerator: distinct quotes with an audit row in the window; denominator: executed quotes by updated_at in the same window, so a quote can be counted in only one of them.",
  },
  {
    key: "requires_reconciliation_open",
    unit: "count",
    scope: "now",
    audience: "admin",
    help: "Quotes in REQUIRES_RECONCILIATION right now.",
  },
  {
    key: "requires_reconciliation_mean_time_to_resolve_seconds",
    unit: "seconds",
    scope: "window",
    audience: "admin",
    help: "Mean seconds from entering REQUIRES_RECONCILIATION to a terminal state.",
    note: "Windowed by the resolution time (quotes.updated_at); entry is the earliest audit row. Quotes still open are excluded.",
  },
  {
    key: "quote_to_settle_latency_seconds_p50",
    unit: "seconds",
    scope: "window",
    audience: "public",
    help: "Median seconds from quote creation to chain-confirmed settlement.",
    note: "Windowed by conversions.settled_at; includes user time; a negative gap from clock skew counts as 0.",
  },
  {
    key: "quote_to_settle_latency_seconds_p95",
    unit: "seconds",
    scope: "window",
    audience: "public",
    help: "95th percentile seconds from quote creation to chain-confirmed settlement.",
    note: "Windowed by conversions.settled_at; includes user time; a negative gap from clock skew counts as 0.",
  },
  {
    key: "submit_to_settle_latency_seconds_p95",
    unit: "seconds",
    scope: "window",
    audience: "admin",
    help: "95th percentile seconds from the wallet's submission to settlement.",
    note: "Windowed by conversions.settled_at; conversions without submitted_at are skipped.",
  },
  {
    key: "indexer_lag_blocks",
    unit: "blocks",
    scope: "now",
    audience: "public",
    help: "Blocks between the chain head and the indexer cursor.",
    note: "Null when the chain head cannot be read or the indexer never ran.",
  },
  {
    key: "indexer_heartbeat_age_seconds",
    unit: "seconds",
    scope: "now",
    audience: "admin",
    help: "Seconds since the indexer's last cursor write.",
  },
  {
    key: "routes_direct_equivalent_live",
    unit: "count",
    scope: "now",
    audience: "public",
    help: "Approved DIRECT_EQUIVALENT pairs whose two representations are both active.",
    note: "The chain's pause state is not mirrored, so it is not consulted.",
  },
  {
    key: "assets_registered",
    unit: "count",
    scope: "now",
    audience: "public",
    help: "Canonical assets in the registry.",
  },
  {
    key: "representations_active",
    unit: "count",
    scope: "now",
    audience: "public",
    help: "Active representations.",
  },
  {
    key: "issuers_active",
    unit: "count",
    scope: "now",
    audience: "public",
    help: "Issuers with at least one active representation.",
  },
  {
    key: "chains_live",
    unit: "count",
    scope: "now",
    audience: "public",
    help: "Chains with at least one active representation.",
    note: "NEAR (the registry's constant 1) plus distinct non-planned chains in asset_profiles.chains of active representations; the bridge chain field is phase 6.",
  },
  {
    key: "volume_input_base_units",
    unit: "base_units",
    scope: "window",
    audience: "admin",
    breakdown: true,
    help: "Settled input amount per from-representation, in its base units.",
    note: "Windowed by quotes.updated_at; not comparable across tokens.",
  },
  {
    key: "fees_collected_base_units",
    unit: "base_units",
    scope: "window",
    audience: "admin",
    breakdown: true,
    help: "Fees per to-representation, in its base units.",
    note: "Windowed by quotes.updated_at; fees are paid in the output token.",
  },
  {
    key: "vault_inventory_base_units",
    unit: "base_units",
    scope: "now",
    audience: "admin",
    breakdown: true,
    help: "Vault inventory owed per representation, in its base units.",
    note: "The registry mirror's vault_inventory; the reconciler cross-checks it against token balances.",
  },
  {
    key: "assets_third_party_attested_pct",
    unit: "percent",
    scope: "now",
    audience: "public",
    help: "Percent of active representations with a third-party or independent verification.",
    note: "A percentage from 0 to 100; 0 by design until phase 3 attestations exist.",
  },
];

export const CATALOGUE: readonly MetricDef[] = [...COMPUTED, ...LATER_PHASES];
