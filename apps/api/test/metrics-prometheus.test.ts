import { adminMetrics } from "@pontis/api-types/fixtures";
import { describe, expect, it } from "vitest";
import { renderPrometheus } from "../src/metrics/prometheus.ts";

describe("renderPrometheus", () => {
  it("writes HELP and TYPE per key and samples labelled by window and simulated", () => {
    const text = renderPrometheus({
      ...adminMetrics,
      metrics: adminMetrics.metrics.filter(
        (m) => m.key === "conversion_success_rate" || m.key === "volume_usd",
      ),
      breakdowns: [],
    });
    expect(text).toContain(
      'pontis_conversion_success_rate{window="24h",simulated="true"} 0.950000',
    );
    expect(text).toContain('pontis_conversion_success_rate{window="7d",simulated="true"} 0.975000');
  });

  it("omits null samples, keeps unavailable metrics as HELP and TYPE only, and labels representations", () => {
    const text = renderPrometheus(adminMetrics);
    expect(text).not.toContain('pontis_conversion_success_rate{window="all"');
    expect(text).toMatch(/# HELP pontis_volume_usd .*phase 1/);
    expect(text).toContain("# TYPE pontis_volume_usd gauge");
    expect(text).not.toMatch(/^pontis_volume_usd\{/m);
    expect(text).toContain(
      'pontis_vault_inventory_base_units{representation="tgold-a",simulated="true"} 1000000',
    );
    expect(text.endsWith("\n")).toBe(true);
  });

  it("escapes label values", () => {
    const text = renderPrometheus({
      ...adminMetrics,
      metrics: [],
      breakdowns: [
        {
          key: "vault_inventory_base_units",
          unit: "base_units",
          scope: "now",
          simulated: false,
          value: { 'a"b\\c\nd': "1" },
        },
      ],
    });
    expect(text).toContain('representation="a\\"b\\\\c\\nd"');
  });
});
