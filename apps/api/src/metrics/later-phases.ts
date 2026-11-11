// Metrics the spec defines whose inputs arrive in later phases (docs/success-metrics.md). They are
// listed in the responses as unavailable, with the phase, so the response documents the full set.

import type { MetricUnit } from "@pontis/api-types";
import type { MetricDef } from "./catalogue.ts";

/** `help` is the key in words; the Prometheus HELP line adds the phase. */
const later = (
  key: string,
  unit: MetricUnit,
  scope: "window" | "now",
  availableFrom: string,
  audience: "public" | "admin" = "public",
): MetricDef => ({ key, unit, scope, audience, availableFrom, help: key.replaceAll("_", " ") });

export const LATER_PHASES: readonly MetricDef[] = [
  later("routes_market_priced_live", "count", "now", "phase 5"),
  later("volume_usd", "usd", "window", "phase 1"),
  later("fees_usd", "usd", "window", "phase 1"),
  later("tvl_usd", "usd", "now", "phase 1"),
  later("lp_utilisation", "ratio", "window", "phase 5"),
  later("lp_net_apy", "ratio", "window", "phase 5"),
  later("bridge_transfers_initiated", "count", "window", "phase 6"),
  later("bridge_transfers_completed", "count", "window", "phase 6"),
  later("bridge_time_to_finality_seconds_median", "seconds", "window", "phase 6"),
  later("bridge_failure_rate", "ratio", "window", "phase 6"),
  later("bridge_refund_rate", "ratio", "window", "phase 6"),
  later("bridge_value_at_risk_in_flight_usd", "usd", "now", "phase 6", "admin"),
  later("assets_fresh_reserve_attestation_pct", "percent", "now", "phase 4"),
  later("reserve_coverage_ratio", "ratio", "now", "phase 4"),
  later("parity_deviation_bps_max", "bps", "window", "phase 1"),
  later("parity_deviation_bps_median", "bps", "window", "phase 1"),
  later("circuit_breaker_trips", "count", "window", "phase 2"),
];
