import { describe, expect, it } from "vitest";
import {
  bpsText,
  canonicalUnits,
  formatUnits,
  formatUnitsCompact,
  ratioText,
  shortId,
  wholeTokenRate,
} from "../lib/format.ts";

describe("amount formatting (bigint only)", () => {
  it("formats smallest units exactly, with grouping", () => {
    expect(formatUnits("1000000", 6)).toBe("1");
    expect(formatUnits("1234567890123", 6)).toBe("1,234,567.890123");
    expect(formatUnits(999_000_000n, 8)).toBe("9.99");
    expect(formatUnits("0", 8)).toBe("0");
  });

  it("keeps values beyond Number precision exact", () => {
    expect(formatUnits("340282366920938463463374607431768211455", 0)).toBe(
      "340,282,366,920,938,463,463,374,607,431,768,211,455",
    );
  });

  it("shortens long fractions only for display", () => {
    expect(formatUnitsCompact("1234567", 6)).toBe("1.2345…");
    expect(formatUnitsCompact("1500000", 6)).toBe("1.5");
  });

  it("derives the whole-token rate from a smallest-unit ratio", () => {
    // 1 TGOLD-A (6 decimals) = 10 TGOLD-B (8 decimals): 1000 smallest B per smallest A.
    expect(wholeTokenRate({ num: "1000", den: "1" }, 6, 8)).toBe("10");
    expect(wholeTokenRate({ num: "1", den: "1000" }, 8, 6)).toBe("0.1");
  });

  it("converts holdings to canonical units", () => {
    expect(canonicalUnits("1000000000000", { num: "1", den: "1000000" })).toBe("1,000,000");
    expect(canonicalUnits("1000000000000000", { num: "1", den: "1000000000" })).toBe("1,000,000");
  });

  it("formats ratios, basis points and ids", () => {
    expect(ratioText({ num: "1", den: "1000000" })).toBe("1 / 1,000,000");
    expect(ratioText({ num: "1000", den: "1" })).toBe("1,000");
    expect(bpsText(10)).toBe("0.10%");
    expect(shortId("3f1f6b0e-8a4d-4c9b-9d52-0c1f6a7a1e10", 8, 4)).toBe("3f1f6b0e…1e10");
  });
});
