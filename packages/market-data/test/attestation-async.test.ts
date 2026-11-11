import { keyFromSeed } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import { signPoint, signPointAsync, verifyPoint, type FeedPoint } from "../src/index.ts";

const key = keyFromSeed(Buffer.alloc(32, 7));
const point = (n: number): FeedPoint => ({
  representationId: `rep-${n % 3}`,
  price: 100_000_000n + BigInt(n),
  currency: "USD",
  asOfMs: Date.UTC(2026, 10, 1) + n * 300_000,
  source: "simulated_feed",
  simulated: true,
});

describe("signPointAsync", () => {
  it("returns exactly what signPoint returns, because ed25519 is deterministic", async () => {
    const points = Array.from({ length: 40 }, (_, n) => point(n));
    const signed = await Promise.all(points.map((p) => signPointAsync(key, p, "core.testnet")));
    expect(signed).toEqual(points.map((p) => signPoint(key, p, "core.testnet")));
    expect(verifyPoint(signed[0]!, points[0]!)).toBe(true);
  });

  it("rejects a price the sync signer would reject", async () => {
    await expect(signPointAsync(key, { ...point(0), price: -1n }, "core.testnet")).rejects.toThrow(
      RangeError,
    );
  });
});
