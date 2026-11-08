import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScheduler } from "../src/sync/scheduler.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startScheduler", () => {
  it("runs immediately and then on every interval", async () => {
    const run = vi.fn(async () => undefined);
    const s = startScheduler({ run, intervalMs: 1000, onError: () => undefined });
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(run).toHaveBeenCalledTimes(3);
    await s.stop();
  });

  it("never overlaps: a slow run makes later ticks skip", async () => {
    let release: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const s = startScheduler({ run, intervalMs: 1000, onError: () => undefined });
    await vi.advanceTimersByTimeAsync(3500);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await s.stop();
  });

  it("reports a failed run and keeps going", async () => {
    const onError = vi.fn();
    const run = vi.fn().mockRejectedValueOnce(new Error("rpc down")).mockResolvedValue(undefined);
    const s = startScheduler({ run, intervalMs: 1000, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(2);
    await s.stop();
  });

  it("stop waits for the in-flight run and starts no more", async () => {
    let release: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const s = startScheduler({ run, intervalMs: 1000, onError: () => undefined });
    let stopped = false;
    const stopping = s.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(run).toHaveBeenCalledTimes(1);
  });
});
