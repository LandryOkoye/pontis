// Protocol success metrics (docs/success-metrics.md): `GET /v1/metrics/protocol` (public),
// `GET /v1/admin/metrics` (admin) and `GET /metrics` (Prometheus text, admin key). The metric keys
// are the exact snake_case names of the spec, in the JSON bodies and as `pontis_<key>` in Prometheus.
//
// Value rules: counts are integers; rates are decimal strings at 6 places and latencies decimal
// strings of seconds at 3 places, both computed with integer arithmetic; a rate with no
// denominator is `null`, never 0; amounts are `AmountString`s of base units.

import { z } from "zod";
import { AmountString, Timestamp, Uuid } from "./common.ts";

export const METRIC_WINDOWS = ["24h", "7d", "all"] as const;
export const MetricWindowSchema = z.enum(METRIC_WINDOWS).meta({
  id: "MetricWindow",
  description: "Rolling window ending at `asOf`; `all` has no lower bound.",
});

export const MetricUnitSchema = z
  .enum(["count", "ratio", "percent", "seconds", "blocks", "base_units", "usd", "bps"])
  .meta({
    id: "MetricUnit",
    description:
      "`ratio` is a share from 0 to 1 and `percent` a share from 0 to 100, both with 6 decimals; `seconds` has 3 decimals.",
  });

export const MetricValueSchema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^[0-9]+\.[0-9]+$/)])
  .nullable()
  .meta({
    id: "MetricValue",
    description:
      "An integer count, or a decimal string for rates and latencies; null when it cannot be computed (no data in the window, or an unreachable chain head).",
  });

export const WindowedValuesSchema = z
  .object({ "24h": MetricValueSchema, "7d": MetricValueSchema, all: MetricValueSchema })
  .meta({ id: "WindowedValues" });

export const MetricSchema = z
  .object({
    /** The snake_case key from the spec. */
    key: z.string(),
    unit: MetricUnitSchema,
    /** `window`: one value per rolling window in `values`; `now`: a single `value`. */
    scope: z.enum(["window", "now"]),
    /** False when the inputs do not exist yet; the metric is listed so the response documents the full set. */
    available: z.boolean(),
    /** The phase that makes it computable. Present exactly when `available` is false. */
    availableFrom: z.string().optional(),
    /**
     * True when any row the metric reads (all time) involves a synthetic asset, which is every
     * row of the testnet deployment. Present exactly when `available` is true.
     */
    simulated: z.boolean().optional(),
    /** How an ambiguous formula was read, in one sentence. */
    note: z.string().optional(),
    values: WindowedValuesSchema.optional(),
    value: MetricValueSchema.optional(),
  })
  .superRefine((m, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!m.available) {
      if (m.availableFrom === undefined) fail("availableFrom is required when unavailable");
      if (m.values !== undefined || m.value !== undefined)
        fail("an unavailable metric has no value");
      return;
    }
    if (m.availableFrom !== undefined) fail("availableFrom is only for unavailable metrics");
    if (m.simulated === undefined) fail("simulated is required when available");
    if (m.scope === "window" && (m.values === undefined || m.value !== undefined))
      fail("a window metric carries `values` only");
    if (m.scope === "now" && (m.value === undefined || m.values !== undefined))
      fail("a now metric carries `value` only");
  })
  .meta({ id: "Metric" });

/** Amounts per representation ID, in that representation's own base units: not comparable across tokens. */
export const RepresentationAmountsSchema = z
  .record(z.string(), AmountString)
  .meta({ id: "RepresentationAmounts" });

export const MetricBreakdownSchema = z
  .object({
    key: z.string(),
    unit: z.literal("base_units"),
    scope: z.enum(["window", "now"]),
    simulated: z.boolean(),
    note: z.string().optional(),
    values: z
      .object({
        "24h": RepresentationAmountsSchema,
        "7d": RepresentationAmountsSchema,
        all: RepresentationAmountsSchema,
      })
      .optional(),
    value: RepresentationAmountsSchema.optional(),
  })
  .meta({ id: "MetricBreakdown" });

export const ProtocolMetricsSchema = z
  .object({
    asOf: Timestamp,
    windows: z.array(MetricWindowSchema),
    /** Aggregates only: no account IDs, quote IDs or per-representation amounts. */
    metrics: z.array(MetricSchema),
  })
  .meta({ id: "ProtocolMetrics" });

export const AdminMetricsSchema = z
  .object({
    asOf: Timestamp,
    windows: z.array(MetricWindowSchema),
    /** Everything the public response lists, plus the admin-only aggregates. */
    metrics: z.array(MetricSchema),
    /** Per-representation amounts: `volume_input_base_units`, `fees_collected_base_units`, `vault_inventory_base_units`. */
    breakdowns: z.array(MetricBreakdownSchema),
    /** Quotes in `REQUIRES_RECONCILIATION` right now, oldest first. */
    requiresReconciliationQuoteIds: z.array(Uuid),
  })
  .meta({ id: "AdminMetrics" });

export const PrometheusTextSchema = z.string().meta({
  id: "PrometheusText",
  description:
    "Prometheus text exposition format 0.0.4: `# HELP` and `# TYPE` lines, then samples named `pontis_<key>` with labels `window`, `representation` and `simulated`.",
});

export type MetricWindow = z.infer<typeof MetricWindowSchema>;
export type MetricUnit = z.infer<typeof MetricUnitSchema>;
export type MetricValue = z.infer<typeof MetricValueSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type MetricBreakdown = z.infer<typeof MetricBreakdownSchema>;
export type ProtocolMetrics = z.infer<typeof ProtocolMetricsSchema>;
export type AdminMetrics = z.infer<typeof AdminMetricsSchema>;
