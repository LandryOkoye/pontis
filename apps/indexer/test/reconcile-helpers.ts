// A reconciler wired to a fake chain and a fixed clock, over a database from `useSeededDb`.

import type { Db } from "@pontis/db";
import { conversions, settlementEvents } from "@pontis/db";
import type { QuoteState } from "@pontis/domain";
import { eq } from "drizzle-orm";
import { Reconciler } from "../src/reconcile/reconciler.ts";
import type { ActionChain } from "../src/reconcile/actions.ts";
import type { ChainCorporateAction } from "@pontis/near-client";
import type { ChainReserveStatus, ReserveChain } from "../src/chain-views.ts";
import type { VaultChain } from "../src/reconcile/vaults.ts";
import { seedQuote } from "./seed.ts";

export const NOW = new Date("2026-11-09T12:00:00Z");
export const MINUTE = 60_000;

/** A `get_reserve_status` result for a monitored representation that is fine; override what a test needs. */
export function reserveStatusFixture(over: Partial<ChainReserveStatus> = {}): ChainReserveStatus {
  return {
    monitored: true,
    state: "ok",
    action: "restrict_conversions",
    tolerance_bps: 0,
    max_reserve_age_ms: 86_400_000,
    attested_units: "1000",
    limit_units: "1000",
    circulating_units: "1000",
    headroom_units: "0",
    ratio_bps: 10_000,
    oldest_as_of_ms: NOW.getTime() - MINUTE,
    age_ms: MINUTE,
    supply_read_ms: NOW.getTime() - MINUTE,
    restricts_conversions: false,
    mint_paused: false,
    simulated: true,
    sources: ["simulated_custodian"],
    ...over,
  };
}

export class FakeVaultChain implements VaultChain, ActionChain, ReserveChain {
  actions = new Map<string, ChainCorporateAction[]>();
  reserves = new Map<string, ChainReserveStatus>();
  escrow = new Map<string, string>();
  inventories = new Map<string, string>();
  balances = new Map<string, string>();
  failing = false;

  /** Both sides of a representation's vault; token accounts are `t<id>.testnet` in the seed. */
  set(representationId: string, inventory: string, balance: string): void {
    this.inventories.set(representationId, inventory);
    this.balances.set(`t${representationId}.testnet`, balance);
  }

  async inventory(representationId: string): Promise<string> {
    if (this.failing) throw new Error("rpc down");
    return this.inventories.get(representationId) ?? "0";
  }

  async corporateActions(assetId: string): Promise<ChainCorporateAction[]> {
    if (this.failing) throw new Error("rpc down");
    return this.actions.get(assetId) ?? [];
  }

  async reserveStatus(representationId: string): Promise<ChainReserveStatus> {
    if (this.failing) throw new Error("rpc down");
    const status = this.reserves.get(representationId);
    if (!status) throw new Error(`no reserve status set for ${representationId}`);
    return status;
  }

  async escrowHeld(representationId: string): Promise<string> {
    return this.escrow.get(representationId) ?? "0";
  }

  async balanceOf(tokenAccountId: string): Promise<string> {
    return this.balances.get(tokenAccountId) ?? "0";
  }
}

export function makeReconciler(db: Db, chain = new FakeVaultChain()) {
  const clock = { now: NOW };
  const reconciler = new Reconciler({
    db,
    chain,
    coreId: "core.testnet",
    stuckAfterMs: 10 * MINUTE,
    lookbackMs: 7 * 24 * 60 * MINUTE,
    now: () => clock.now,
  });
  return { reconciler, chain, clock };
}

/** A quote in `state` whose transaction was reported `minutesAgo` before `NOW`. */
export async function quoteSubmitted(db: Db, minutesAgo: number, state: QuoteState = "SUBMITTED") {
  const q = await seedQuote(db, state, "HASH");
  await db
    .update(conversions)
    .set({ submittedAt: new Date(NOW.getTime() - minutesAgo * MINUTE) })
    .where(eq(conversions.id, q.conversionId ?? ""));
  return q;
}

export async function addEvent(
  db: Db,
  conversionId: string | undefined,
  eventName: string,
  data: unknown,
  receiptId = `r-${Math.random()}`,
) {
  await db.insert(settlementEvents).values({
    receiptId,
    logIndex: 0,
    blockHeight: 1,
    blockTimestamp: NOW,
    txHash: null,
    eventName,
    data,
    conversionId: conversionId ?? null,
  });
}
