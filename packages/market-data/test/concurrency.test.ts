import { describe, expect, it } from "vitest";
import { mapLimit } from "../src/index.ts";

describe("mapLimit", () => {
  it("keeps input order, never exceeds the limit and runs everything", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, n));
      running--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(peak).toBe(3);
  });

  it("handles an empty list and rejects on the first failure", async () => {
    expect(await mapLimit([], 4, async (n: number) => n)).toEqual([]);
    await expect(
      mapLimit([1, 2, 3], 2, async (n) => (n === 2 ? Promise.reject(new Error("boom")) : n)),
    ).rejects.toThrow("boom");
  });
});
