import { describe, expect, it } from "vitest";
import { decimalRatio, percent6, ratio6 } from "../src/metrics/core.ts";

describe("rate arithmetic", () => {
  it("rounds half up at 6 places from integers and gives null for a zero denominator", () => {
    expect(ratio6(1n, 3n)).toBe("0.333333");
    expect(ratio6(2n, 3n)).toBe("0.666667");
    expect(ratio6(1n, 1n)).toBe("1.000000");
    expect(ratio6(0n, 5n)).toBe("0.000000");
    expect(ratio6(0n, 0n)).toBeNull();
    expect(percent6(1n, 3n)).toBe("33.333333");
    expect(decimalRatio(1n, 8n, 2)).toBe("0.13");
    // Beyond double precision: 10^30 / (3 * 10^30).
    expect(ratio6(10n ** 30n, 3n * 10n ** 30n)).toBe("0.333333");
  });
});
