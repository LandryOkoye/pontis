import { describe, expect, it } from "vitest";
import { catalogueFor } from "../lib/catalogue-tiers.ts";
import { CONTRACT_LIMITS, REDEMPTION_STATES } from "../lib/catalogue-custody-types.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";

const full = catalogueFor("full");
const reps = new Map(full.representations.map((r) => [r.id, r]));
const claimOf = (id: string) => full.claims.find((c) => c.id === reps.get(id)?.claimId);
const { terms, redemptions, custody } = custodyFor("full");
const termsOf = (id: string) => terms.find((t) => t.representationId === id);

describe("redemption terms", () => {
  it("reference an existing representation, once each", () => {
    expect(new Set(terms.map((t) => t.representationId)).size).toBe(terms.length);
    for (const t of terms) expect(reps.has(t.representationId), t.representationId).toBe(true);
  });

  it("are valid against the contract's redemption validation", () => {
    for (const t of terms) {
      const id = t.representationId;
      expect(t.minWhole, id).toBeGreaterThan(0n);
      expect(t.maxWhole === 0n || t.maxWhole >= t.minWhole, id).toBe(true);
      expect(t.feeBps, id).toBeLessThanOrEqual(CONTRACT_LIMITS.maxFeeBps);
      expect(t.acceptWithinMs, id).toBeGreaterThanOrEqual(CONTRACT_LIMITS.minAcceptWithinMs);
      expect(t.acceptWithinMs, id).toBeLessThanOrEqual(CONTRACT_LIMITS.maxAcceptWithinMs);
      expect(t.settlementDays, id).toBeGreaterThanOrEqual(1);
      expect(t.settlementDays, id).toBeLessThanOrEqual(CONTRACT_LIMITS.maxSettlementDays);
      if (t.window) {
        expect(t.window.lengthMs, id).toBeGreaterThan(0);
        expect(t.window.lengthMs, id).toBeLessThanOrEqual(t.window.periodMs);
      }
    }
  });

  it("cover every fund, note and precious-metal claim that has custody, and nothing else", () => {
    const redeemable = /Treasury|money-market|bond fund|credit note|precious-metal/i;
    for (const c of custody) {
      const category = claimOf(c.representationId)?.category ?? "";
      expect(termsOf(c.representationId) !== undefined, c.representationId).toBe(
        redeemable.test(category),
      );
    }
    for (const t of terms) {
      expect(claimOf(t.representationId)?.category, t.representationId).toMatch(redeemable);
    }
  });

  it("have a few narrow windows and one gated note that is open for a few days in six months", () => {
    expect(terms.filter((t) => t.window !== null).length).toBeGreaterThanOrEqual(4);
    const gated = termsOf("ttrd-b");
    expect(claimOf("ttrd-b")?.category).toMatch(/credit note/);
    expect(gated?.window?.periodMs).toBeGreaterThanOrEqual(150 * 86_400_000);
    expect((gated?.window?.lengthMs ?? 0) / (gated?.window?.periodMs ?? 1)).toBeLessThan(0.05);
  });

  it("are in the demo tier only for the demo custody assets, and the demo has some narrow ones", () => {
    const demo = custodyFor("demo");
    const present = new Set(catalogueFor("demo").representations.map((r) => r.id));
    expect(demo.terms.map((t) => t.representationId).sort()).toEqual([
      "tgkg-a",
      "tgkg-d",
      "tmmfusd-m",
      "ttb3m-m",
    ]);
    for (const t of demo.terms) expect(present.has(t.representationId)).toBe(true);
    expect(demo.terms.some((t) => t.window !== null)).toBe(true);
    expect(custodyFor("mvp").terms).toEqual([]);
  });
});

describe("simulated redemptions", () => {
  it("are three, in three different states, in the demo tier and so in full", () => {
    expect(custodyFor("demo").redemptions).toEqual(redemptions);
    expect(redemptions.map((r) => r.state).sort()).toEqual([...REDEMPTION_STATES].sort());
    expect(custodyFor("mvp").redemptions).toEqual([]);
  });

  it("go through always-open terms, within their limits and the holder's balance", () => {
    for (const r of redemptions) {
      const t = termsOf(r.representationId);
      expect(t, r.representationId).toBeDefined();
      expect(t?.window, r.representationId).toBeNull();
      expect(r.amountWhole).toBeGreaterThanOrEqual(t?.minWhole ?? 0n);
      if (t && t.maxWhole > 0n) expect(r.amountWhole).toBeLessThanOrEqual(t.maxWhole);
      expect(r.amountWhole).toBeLessThanOrEqual(reps.get(r.representationId)?.startingSupply ?? 0n);
    }
  });

  it("burn only through a token whose minter is the core: a fulfilled one is gated", () => {
    for (const r of redemptions.filter((x) => x.state === "fulfilled")) {
      expect(custody.find((c) => c.representationId === r.representationId)?.gatedMint).toBe(true);
    }
  });
});
