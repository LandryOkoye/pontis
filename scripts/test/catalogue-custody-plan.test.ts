import { devKey } from "@pontis/dev-keys";
import { describe, expect, it } from "vitest";
import {
  custodianArgs,
  payoutInstructionHash,
  policyArgs,
  redeemMessage,
  termsArgs,
} from "../lib/catalogue-custody-plan.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { DEMO_CUSTODY } from "../lib/catalogue-custody-reps.ts";

const full = custodyFor("full");

describe("custody call arguments", () => {
  it("register every custodian as synthetic and unverified, with the dev reserve-attester key", () => {
    for (const c of full.custodians) {
      const { custodian } = custodianArgs(c);
      expect(custodian.synthetic).toBe(true);
      expect(custodian.verification_status).toBe("unverified");
      expect(custodian.evidence).toEqual([]);
      expect(custodian.attester_key).toBe(devKey("reserve-attester").publicKey);
    }
  });

  it("sets a policy with the baseline supply as a decimal string", () => {
    const row = DEMO_CUSTODY.find((r) => r.story === "stale")!;
    expect(policyArgs(row, 12_345n).policy).toEqual({
      tolerance_bps: 0,
      max_reserve_age_ms: 300_000,
      action: "restrict_conversions",
      baseline_supply: "12345",
    });
  });

  it("scales terms by the token's decimals and writes no window as zeros", () => {
    const t = full.terms.find((x) => x.representationId === "tgkg-a")!;
    expect(termsArgs(t, 6).terms).toMatchObject({
      min_amount: "1000000",
      max_amount: "1000000000",
      window_anchor_ms: 0,
      window_length_ms: 0,
      window_period_ms: 0,
      settlement_days: 3,
    });
    const gated = full.terms.find((x) => x.representationId === "ttrd-b")!;
    expect(termsArgs(gated, 6).terms.window_period_ms).toBe(180 * 86_400_000);
  });

  it("hashes a payout instruction deterministically, per redemption, and builds the redeem message", () => {
    const [a, b] = full.redemptions;
    expect(payoutInstructionHash(a!)).toMatch(/^[0-9a-f]{64}$/);
    expect(payoutInstructionHash(a!)).toBe(payoutInstructionHash(a!));
    expect(payoutInstructionHash(a!)).not.toBe(payoutInstructionHash(b!));
    expect(redeemMessage("a".repeat(64), "b".repeat(64))).toBe(
      `redeem:${"a".repeat(64)}:${"b".repeat(64)}`,
    );
  });
});
