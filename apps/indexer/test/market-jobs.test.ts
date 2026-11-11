import type { Db } from "@pontis/db";
import { describe, expect, it } from "vitest";
import { runMarketJobs } from "../src/market-jobs.ts";

describe("runMarketJobs", () => {
  it("logs a failed pass, waits the interval and stops when aborted", async () => {
    const controller = new AbortController();
    const errors: string[] = [];
    const waits: number[] = [];
    await runMarketJobs({
      // Not a database: the first query throws, which is what a lost connection looks like.
      db: {} as Db,
      intervalMs: 5_000,
      windowMs: 60_000,
      signal: controller.signal,
      log: { info: () => undefined, error: (message) => errors.push(message) },
      sleep: async (ms) => {
        waits.push(ms);
        controller.abort();
      },
    });
    expect(errors).toEqual(["market jobs failed; will retry"]);
    expect(waits).toEqual([5_000]);
  });
});
