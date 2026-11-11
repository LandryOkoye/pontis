// Redemption terms, requests, state changes and the timeline, applied to the mirror tables.

import {
  issuerReliability,
  redemptionEvents,
  redemptionPayoutInstructions,
  redemptionRefusals,
  redemptionTerms,
  redemptions,
} from "@pontis/db";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { execution, useSeededDb } from "./harness.ts";
import * as fx from "./mirror-fixtures.ts";

const h = useSeededDb();

const row = async (id: number) =>
  (await h.db.select().from(redemptions).where(eq(redemptions.id, id)))[0];
const timeline = async (id: number) =>
  (
    await h.db
      .select()
      .from(redemptionEvents)
      .where(eq(redemptionEvents.redemptionId, id))
      .orderBy(asc(redemptionEvents.id))
  ).map((e) => e.kind);

describe("redemption terms", () => {
  it("keeps every version and the hash the request must quote", async () => {
    await h.apply(execution([fx.redemptionTermsSet()]));
    await h.apply(
      execution([
        fx.redemptionTermsSet({
          version: 2,
          terms_hash: fx.HASH_B,
          terms: {
            min_amount: "2000000",
            max_amount: "9000000",
            fee_bps: 30,
            window_anchor_ms: fx.T0,
            window_length_ms: 3_600_000,
            window_period_ms: fx.DAY,
            accept_within_ms: 3_600_000,
            settlement_days: 5,
          },
        }),
      ]),
    );
    const rows = await h.db.select().from(redemptionTerms).orderBy(asc(redemptionTerms.version));
    expect(rows.map((r) => [r.version, r.termsHash, r.minAmount, r.maxAmount, r.feeBps])).toEqual([
      [1, fx.HASH_A, "1000000", "0", 25],
      [2, fx.HASH_B, "2000000", "9000000", 30],
    ]);
    expect(rows[1]).toMatchObject({
      windowPeriodMs: fx.DAY,
      windowLengthMs: 3_600_000,
      acceptWithinMs: 3_600_000,
      settlementDays: 5,
      setBy: "reg.testnet",
    });
  });
});

describe("a redemption that is fulfilled", () => {
  it("is created with its fee, net, deadline and terms snapshot", async () => {
    await h.apply(execution([fx.redemptionRequested()]));
    const r = await row(1);
    expect(r).toMatchObject({
      userAccountId: "alice.testnet",
      representationId: "a",
      issuerId: "meridian-sim",
      amount: "5000000",
      feeBps: 25,
      feeUnits: "12500",
      netUnits: "4987500",
      termsHash: fx.HASH_A,
      termsVersion: 1,
      payoutInstructionHash: fx.HASH_B,
      status: "requested",
      acceptedAt: null,
      miss: null,
    });
    expect(r?.acceptDeadlineAt.getTime()).toBe(fx.T0 + fx.DAY);
    expect(await timeline(1)).toEqual(["requested"]);
  });

  it("is accepted with the fulfil deadline the contract set", async () => {
    await h.apply(execution([fx.redemptionAccepted()]));
    const r = await row(1);
    expect(r?.status).toBe("accepted");
    expect(r?.acceptedAt?.getTime()).toBe(fx.T0 + 60_000);
    expect(r?.fulfilDeadlineAt?.getTime()).toBe(fx.T0 + 60_000 + 3 * fx.DAY);
  });

  it("keeps the redemption accepted when a burn fails, and is fulfilled on the retry", async () => {
    await h.apply(
      execution([["redemption_fulfil_failed", { id: 1, timestamp_ms: fx.T0 + 90_000 }]]),
    );
    expect((await row(1))?.status).toBe("accepted");
    await h.apply(execution([fx.redemptionFulfilled()]));
    const r = await row(1);
    expect(r).toMatchObject({ status: "fulfilled", fulfilmentEvidenceHash: fx.HASH_C });
    expect(r?.resolvedAt?.getTime()).toBe(fx.T0 + 120_000);
    expect(await timeline(1)).toEqual(["requested", "accepted", "fulfil_failed", "fulfilled"]);
  });

  it("carries the transaction facts on every timeline row, and no hash it cannot prove", async () => {
    const events = await h.db
      .select()
      .from(redemptionEvents)
      .where(eq(redemptionEvents.redemptionId, 1));
    expect(events).toHaveLength(4);
    for (const e of events) {
      expect(e.txHash).toBeNull();
      expect(e.receiptId).toMatch(/^receipt-/);
      expect(e.blockHeight).toBe(100);
    }
  });
});

describe("a redemption that is rejected or expires, then is reclaimed", () => {
  it("rejects with the reason, then reclaims", async () => {
    await h.apply(execution([fx.redemptionRequested({ id: 2 }), fx.redemptionRejected({ id: 2 })]));
    expect(await row(2)).toMatchObject({
      status: "rejected",
      rejectReason: "payout_details_unreadable",
    });
    await h.apply(execution([fx.redemptionReclaimed({ id: 2 })]));
    expect((await row(2))?.status).toBe("reclaimed");
    expect(await timeline(2)).toEqual(["requested", "rejected", "reclaimed"]);
  });

  it("expires with the deadline that was missed, survives a failed reclaim, then reclaims", async () => {
    await h.apply(
      execution([
        fx.redemptionRequested({ id: 3 }),
        fx.redemptionExpired({ id: 3, miss: "accept" }),
        ["redemption_reclaim_failed", { id: 3, timestamp_ms: fx.T0 + fx.DAY + 5 }],
      ]),
    );
    expect(await row(3)).toMatchObject({ status: "expired", miss: "accept" });
    await h.apply(execution([fx.redemptionReclaimed({ id: 3 })]));
    expect((await row(3))?.status).toBe("reclaimed");
    expect(await timeline(3)).toEqual(["requested", "expired", "reclaim_failed", "reclaimed"]);
  });

  it("records a missed fulfil deadline on an accepted redemption", async () => {
    await h.apply(
      execution([
        fx.redemptionRequested({ id: 4 }),
        fx.redemptionAccepted({ id: 4 }),
        fx.redemptionExpired({ id: 4, miss: "fulfil" }),
      ]),
    );
    expect(await row(4)).toMatchObject({ status: "expired", miss: "fulfil" });
  });
});

describe("issuer reliability", () => {
  it("marks the issuer for a refresh on every redemption event, without inventing counters", async () => {
    const [issuer] = await h.db.select().from(issuerReliability);
    expect(issuer).toMatchObject({
      issuerId: "meridian-sim",
      needsRefresh: true,
      requested: 0,
      simulated: true,
    });
    await h.db.update(issuerReliability).set({ needsRefresh: false });
    await h.apply(
      execution([fx.redemptionExpired({ id: 4, miss: "fulfil", timestamp_ms: fx.T0 + 9 })]),
    );
    expect((await h.db.select().from(issuerReliability))[0]?.needsRefresh).toBe(true);
  });
});

describe("replay", () => {
  it("does not apply a redemption's events twice or let an old block undo a newer state", async () => {
    const created = execution([fx.redemptionRequested({ id: 10 })]);
    await h.apply(created);
    await h.apply(execution([fx.redemptionAccepted({ id: 10 })]));
    expect(await h.apply(created)).toMatchObject({ stored: 0, duplicates: 1 });
    expect((await row(10))?.status).toBe("accepted");
    expect(await timeline(10)).toEqual(["requested", "accepted"]);
  });

  it("does not move a redemption it has never seen created", async () => {
    await h.apply(execution([fx.redemptionAccepted({ id: 404 })]));
    expect(await row(404)).toBeUndefined();
    expect(await timeline(404)).toEqual(["accepted"]);
  });
});

describe("a refused redemption request", () => {
  it("is recorded once, with the contract's reason, and creates no redemption", async () => {
    const before = (await h.db.select().from(redemptions)).length;
    const refused = execution([fx.redemptionRefused({ reason: "BELOW_MIN", amount: "10" })]);
    await h.apply(refused);
    await h.apply(refused);
    const rows = await h.db.select().from(redemptionRefusals);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reason: "BELOW_MIN",
      senderId: "alice.testnet",
      token: "a.pontis.testnet",
      amount: "10",
    });
    expect(rows[0]?.at.getTime()).toBe(fx.T0 + 5_000);
    expect((await h.db.select().from(redemptions)).length).toBe(before);
  });

  it("keeps two refusals in one receipt as two rows", async () => {
    await h.apply(
      execution([
        fx.redemptionRefused({ reason: "WINDOW_CLOSED", sender_id: "bob.testnet" }),
        fx.redemptionRefused({ reason: "INVALID_MSG", sender_id: "bob.testnet" }),
      ]),
    );
    const rows = await h.db
      .select()
      .from(redemptionRefusals)
      .where(eq(redemptionRefusals.senderId, "bob.testnet"));
    expect(rows.map((r) => r.reason).sort()).toEqual(["INVALID_MSG", "WINDOW_CLOSED"]);
  });
});

describe("linking a prepared payout instruction to its redemption", () => {
  const prepared = (over: Partial<typeof redemptionPayoutInstructions.$inferInsert> = {}) => ({
    accountId: "carol.testnet",
    representationId: "a",
    amount: "5000000",
    termsHash: fx.HASH_A,
    payoutInstructionHash: fx.HASH_C,
    ciphertext: "AAEC",
    ...over,
  });
  const linked = async (accountId: string) =>
    (
      await h.db
        .select()
        .from(redemptionPayoutInstructions)
        .where(eq(redemptionPayoutInstructions.accountId, accountId))
        .orderBy(asc(redemptionPayoutInstructions.createdAt))
    ).map((r) => r.redemptionId);

  it("sets the redemption id on the oldest unlinked row of the same account and hash, one per request", async () => {
    await h.db
      .insert(redemptionPayoutInstructions)
      .values(prepared({ createdAt: new Date(fx.T0 - 2_000) }));
    await h.db
      .insert(redemptionPayoutInstructions)
      .values(prepared({ createdAt: new Date(fx.T0 - 1_000) }));
    await h.apply(
      execution([
        fx.redemptionRequested({
          id: 50,
          user: "carol.testnet",
          payout_instruction_hash: fx.HASH_C,
        }),
      ]),
    );
    expect(await linked("carol.testnet")).toEqual([50, null]);
    await h.apply(
      execution([
        fx.redemptionRequested({
          id: 51,
          user: "carol.testnet",
          payout_instruction_hash: fx.HASH_C,
        }),
      ]),
    );
    expect(await linked("carol.testnet")).toEqual([50, 51]);
  });

  it("does not link another account's row, another hash, or anything when none was prepared", async () => {
    await h.db.insert(redemptionPayoutInstructions).values(prepared({ accountId: "dave.testnet" }));
    await h.apply(
      execution([
        fx.redemptionRequested({
          id: 52,
          user: "erin.testnet",
          payout_instruction_hash: fx.HASH_C,
        }),
        fx.redemptionRequested({
          id: 53,
          user: "dave.testnet",
          payout_instruction_hash: fx.HASH_A,
        }),
      ]),
    );
    expect(await linked("dave.testnet")).toEqual([null]);
    expect((await row(52))?.status).toBe("requested");
  });

  it("is idempotent on replay of the same receipt", async () => {
    await h.db
      .insert(redemptionPayoutInstructions)
      .values(prepared({ accountId: "frank.testnet" }));
    const requested = execution([
      fx.redemptionRequested({ id: 54, user: "frank.testnet", payout_instruction_hash: fx.HASH_C }),
    ]);
    await h.apply(requested);
    await h.apply(requested);
    expect(await linked("frank.testnet")).toEqual([54]);
  });
});
