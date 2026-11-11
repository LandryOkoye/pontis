// Prometheus text exposition (format 0.0.4) of the admin view. Every metric is a gauge: the window
// values are rolling, so they can fall, and the percentiles are already computed. A null value has
// no sample (Prometheus has no null); an unavailable metric keeps its HELP and TYPE lines.

import type { AdminMetrics, MetricValue } from "@pontis/api-types";
import { CATALOGUE } from "./catalogue.ts";

export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const helpText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
const labelValue = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

type Labels = Record<string, string>;
const sample = (name: string, labels: Labels, value: string | number) =>
  `${name}{${Object.entries(labels)
    .map(([k, v]) => `${k}="${labelValue(v)}"`)
    .join(",")}} ${value}`;

export function renderPrometheus(view: AdminMetrics): string {
  const helpByKey = new Map(CATALOGUE.map((d) => [d.key, d.help]));
  const lines: string[] = [];
  const header = (key: string, suffix: string) => {
    const name = `pontis_${key}`;
    lines.push(`# HELP ${name} ${helpText(`${helpByKey.get(key) ?? key}${suffix}`)}`);
    lines.push(`# TYPE ${name} gauge`);
    return name;
  };
  const point = (name: string, labels: Labels, value: MetricValue | undefined) => {
    if (value !== null && value !== undefined) lines.push(sample(name, labels, value));
  };

  for (const m of view.metrics) {
    const name = header(
      m.key,
      m.available ? "" : ` Not available until ${m.availableFrom ?? "a later phase"}.`,
    );
    if (!m.available) continue;
    const simulated = String(m.simulated ?? false);
    if (m.values) {
      for (const w of view.windows) point(name, { window: w, simulated }, m.values[w]);
    } else point(name, { simulated }, m.value);
  }
  for (const b of view.breakdowns) {
    const name = header(b.key, "");
    const simulated = String(b.simulated);
    if (b.values) {
      for (const w of view.windows)
        for (const [representation, amount] of Object.entries(b.values[w]))
          point(name, { window: w, representation, simulated }, amount);
    } else
      for (const [representation, amount] of Object.entries(b.value ?? {}))
        point(name, { representation, simulated }, amount);
  }
  return `${lines.join("\n")}\n`;
}
