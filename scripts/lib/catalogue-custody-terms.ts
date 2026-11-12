// Redemption terms and the simulated redemptions of the demo catalogue (ADR 0020 section 7).
// Fiction: nothing is redeemed for anything, no money moves, the issuer is a test account.
// Amounts are whole tokens. Most terms are always open; a few have narrow windows, and one note is
// gated (it opens for a few days every six months).

import type {
  PlannedRedemption,
  PlannedTerms,
  PlannedWindow,
  CustodyTier,
} from "./catalogue-custody-types.ts";

const DAY_MS = 86_400_000;
/** 2026-01-01T00:00:00Z: the anchor every periodic window counts from. */
const ANCHOR_MS = 1_767_225_600_000;

const every = (periodDays: number, openDays: number): PlannedWindow => ({
  anchorMs: ANCHOR_MS,
  periodMs: periodDays * DAY_MS,
  lengthMs: openDays * DAY_MS,
});

function terms(
  tier: CustodyTier,
  representationId: string,
  minWhole: bigint,
  maxWhole: bigint,
  feeBps: number,
  settlementDays: number,
  options: { window?: PlannedWindow; acceptDays?: number } = {},
): PlannedTerms {
  return {
    representationId,
    tier,
    minWhole,
    maxWhole,
    feeBps,
    window: options.window ?? null,
    acceptWithinMs: (options.acceptDays ?? 1) * DAY_MS,
    settlementDays,
  };
}

export const TERMS: readonly PlannedTerms[] = [
  terms("demo", "ttb3m-m", 10n, 0n, 25, 2),
  terms("demo", "tmmfusd-m", 1n, 0n, 10, 1),
  terms("demo", "tgkg-a", 1n, 1000n, 50, 3, { acceptDays: 2 }),
  terms("demo", "tgkg-d", 1n, 500n, 60, 3, { window: every(30, 3), acceptDays: 2 }),
  terms("full", "tustb-h", 10n, 0n, 25, 2),
  terms("full", "tustb-o", 10n, 0n, 30, 2),
  terms("full", "ttb3m-e", 10n, 0n, 25, 2),
  terms("full", "tlad-e", 10n, 0n, 35, 3, { window: every(7, 2) }),
  terms("full", "tmmfusd-e", 1n, 0n, 10, 1),
  terms("full", "tmmfeur-e", 1n, 0n, 15, 1),
  terms("full", "tmmfeur-c", 1n, 0n, 15, 1),
  terms("full", "tigc-c", 10n, 100_000n, 40, 3),
  terms("full", "tigc-r", 10n, 50_000n, 40, 3),
  terms("full", "tcredit-1", 100n, 0n, 100, 5, { acceptDays: 3 }),
  terms("full", "tsme-b", 500n, 0n, 120, 7, { window: every(91, 5), acceptDays: 3 }),
  terms("full", "ttrd-b", 1000n, 0n, 150, 10, { window: every(180, 3), acceptDays: 7 }),
  terms("full", "tcredit-b", 100n, 0n, 100, 5, { window: every(30, 7), acceptDays: 3 }),
  terms("full", "tsil-a", 1n, 500n, 50, 3, { window: every(14, 2), acceptDays: 2 }),
  terms("full", "tsil-w", 1n, 0n, 50, 3, { acceptDays: 2 }),
];

/** Three live redemptions in different states, labelled simulated in the plan and the docs. */
export const REDEMPTIONS: readonly PlannedRedemption[] = [
  { representationId: "ttb3m-m", tier: "demo", state: "fulfilled", amountWhole: 25n },
  { representationId: "tmmfusd-m", tier: "demo", state: "accepted", amountWhole: 40n },
  { representationId: "tgkg-a", tier: "demo", state: "requested", amountWhole: 5n },
];
