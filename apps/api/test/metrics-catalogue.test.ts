import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../src/metrics/catalogue.ts";
import { SPEC_KEYS } from "./metrics-helpers.ts";

describe("metric catalogue", () => {
  it("holds exactly the spec's keys, each once", () => {
    expect(CATALOGUE.map((d) => d.key).sort()).toEqual([...SPEC_KEYS].sort());
  });

  it("marks the 19 keys the spec says are computable today and phases the rest", () => {
    const today = CATALOGUE.filter((d) => d.availableFrom === undefined);
    expect(today).toHaveLength(19);
    for (const d of CATALOGUE.filter((m) => m.availableFrom !== undefined))
      expect(d.availableFrom, d.key).toMatch(/^phase [1-6]$/);
  });
});
