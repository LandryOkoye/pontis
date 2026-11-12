import { describe, expect, it } from "vitest";
import { comparePriority, crosses, deviationBps, validateOrder } from "../src/matching-policy.ts";
import type { PrivateOrder } from "../src/private-crypto.ts";

const order = (side: "buy" | "sell", price: string, createdAtMs = 1_000): PrivateOrder => ({
  id: `${side}-${price}`,
  institutionId: `${side}-institution`,
  assetId: "sim:asset",
  side,
  size: "1",
  limitPrice: price,
  expiryMs: 2_000,
  createdAtMs,
});

describe("private order policy", () => {
  it("crosses only opposing limits and sorts price before time", () => {
    expect(crosses(order("buy", "101"), order("sell", "100"))).toBe(true);
    expect(crosses(order("buy", "99"), order("sell", "100"))).toBe(false);
    expect(comparePriority(order("buy", "101"), order("buy", "100"))).toBe(-1);
    expect(comparePriority(order("sell", "99"), order("sell", "100"))).toBe(-1);
  });

  it("uses integer oracle deviation and rejects expired orders", () => {
    expect(deviationBps(101n, 100n)).toBe(100n);
    expect(() => validateOrder(order("buy", "100", 3_000), 2_000)).toThrow(/expired/);
  });
});
