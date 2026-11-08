// Shared setup for the apply tests: a throwaway database with the registry seeded.

import { conversions, quotes, settlementEvents } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll } from "vitest";
import { applyExecutions } from "../src/apply.ts";
import type { CoreExecution } from "../src/chain-source.ts";
import { seedRegistry } from "./seed.ts";

const T0 = new Date("2026-11-07T18:00:00Z");

export function useSeededDb() {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seedRegistry(t.db);
  });
  afterAll(async () => {
    await t.drop();
  });
  return {
    get db() {
      return t.db;
    },
    apply: (...executions: CoreExecution[]) =>
      t.db.transaction((tx) => applyExecutions(tx, executions)),
    async quoteState(id: string) {
      return (await t.db.select().from(quotes).where(eq(quotes.id, id)))[0]?.state;
    },
    async conversion(id: string | undefined) {
      return (
        await t.db
          .select()
          .from(conversions)
          .where(eq(conversions.id, id ?? ""))
      )[0];
    },
    async eventsOf(receiptId: string) {
      return t.db.select().from(settlementEvents).where(eq(settlementEvents.receiptId, receiptId));
    },
  };
}

let receipts = 0;
/** One successful core execution whose logs are the given events. */
export function execution(
  events: [string, unknown][],
  over: Partial<CoreExecution> = {},
): CoreExecution {
  const line = (name: string, data: unknown) =>
    `EVENT_JSON:${JSON.stringify({ standard: "pontis", version: "1.0.0", event: name, data })}`;
  return {
    receiptId: `receipt-${++receipts}`,
    blockHeight: 100,
    blockHash: "H",
    blockTimestamp: new Date(T0.getTime() + 5_000),
    success: true,
    logs: events.map(([name, data]) => line(name, data)),
    ...over,
  };
}

export const completed = (nonce: string, over: Record<string, unknown> = {}): [string, unknown] => [
  "conversion_completed",
  { nonce, user: "alice.testnet", amount_in: "1000000", amount_out: "999000", ...over },
];
