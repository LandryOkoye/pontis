import { RpcError } from "@pontis/near-client";
import { describe, expect, it } from "vitest";
import { backoffMs, withRetry } from "../src/retry.ts";

const options = { attempts: 4, baseMs: 100, maxMs: 350 };

describe("withRetry", () => {
  it("retries transient failures with doubling, capped delays and then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 4) throw new RpcError("RPC HTTP 502");
        return "ok";
      },
      { ...options, sleep: async (ms) => void waits.push(ms) },
    );
    expect([result, calls, waits]).toEqual(["ok", 4, [100, 200, 350]]);
  });

  it("gives up after the last attempt with the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => Promise.reject(new Error(`boom ${++calls}`)), {
        ...options,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("boom 4");
  });

  it("does not retry a definitive answer from the node", async () => {
    let calls = 0;
    const unknown = new RpcError("Server error", -32000, { causeName: "UNKNOWN_BLOCK" });
    await expect(withRetry(async () => (++calls, Promise.reject(unknown)), options)).rejects.toBe(
      unknown,
    );
    expect(calls).toBe(1);
  });

  it("retries a busy node's structured timeout", async () => {
    let calls = 0;
    await withRetry(
      async () => {
        if (++calls === 1) throw new RpcError("timeout", -32000, { causeName: "TIMEOUT_ERROR" });
      },
      { ...options, sleep: async () => undefined },
    );
    expect(calls).toBe(2);
  });

  it("caps the delay", () => {
    expect(backoffMs(10, 100, 5_000)).toBe(5_000);
  });
});
