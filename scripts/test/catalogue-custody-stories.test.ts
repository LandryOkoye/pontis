import { describe, expect, it } from "vitest";
import { catalogueFor } from "../lib/catalogue-tiers.ts";
import { CUSTODIANS } from "../lib/catalogue-custody-custodians.ts";
import { CONTRACT_LIMITS, RESERVE_STORIES } from "../lib/catalogue-custody-types.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";

const full = catalogueFor("full");
const reps = new Map(full.representations.map((r) => [r.id, r]));
const claimOf = (id: string) => full.claims.find((c) => c.id === reps.get(id)?.claimId);
const rows = custodyFor("full").custody;

/** The contract's invariant: circulating <= attested * (1 + tolerance / 10000), on the cover. */
const withinLimit = (r: (typeof rows)[number]) =>
  r.coverBps !== null && r.coverBps * (10_000 + r.policy.toleranceBps) >= 10_000 * 10_000;

describe("the full custody set", () => {
  it("use every custodian and every structure, and the demo tier has custody for about six assets", () => {
    expect(new Set(rows.map((r) => r.custodianId)).size).toBe(CUSTODIANS.length);
    expect(new Set(rows.map((r) => r.structure))).toEqual(
      new Set(["segregated", "omnibus", "on_chain_vault"]),
    );
    expect(custodyFor("demo").custody.length).toBe(6);
    expect(custodyFor("mvp").custody).toEqual([]);
  });

  it("leave a share, an index tracker, an art piece and unverified issuers without custody", () => {
    for (const id of ["tacme-h", "tidxg-c", "tart-m", "tusd-s", "tjpy-s", "tqfb-o"]) {
      expect(
        rows.some((r) => r.representationId === id),
        id,
      ).toBe(false);
    }
  });

  it("match the category: metals, funds, real estate, stable value and carbon only", () => {
    const allowed =
      /Treasury|money-market|bond fund|credit note|precious-metal|industrial commodity|real-estate|real estate|stable-value|dollar-pegged|carbon/i;
    for (const r of rows)
      expect(claimOf(r.representationId)?.category, r.representationId).toMatch(allowed);
  });
});

describe("reserve policies", () => {
  it("are valid against the contract's tolerance and age bounds", () => {
    for (const r of rows) {
      expect(r.policy.toleranceBps, r.representationId).toBeLessThanOrEqual(
        CONTRACT_LIMITS.maxToleranceBps,
      );
      expect(r.policy.maxReserveAgeMs, r.representationId).toBeGreaterThanOrEqual(
        CONTRACT_LIMITS.minReserveAgeMs,
      );
      expect(r.policy.maxReserveAgeMs, r.representationId).toBeLessThanOrEqual(
        CONTRACT_LIMITS.maxReserveAgeMs,
      );
      if (r.coverBps !== null) expect(r.coverBps).toBeLessThanOrEqual(100_000);
      expect(r.policy.maxReserveAgeMs <= 600_000, r.representationId).toBe(r.story === "stale");
    }
  });

  it("tell every story at least once", () => {
    expect(new Set(rows.map((r) => r.story))).toEqual(new Set(RESERVE_STORIES));
    expect(rows.filter((r) => r.story === "stale")).toHaveLength(1);
    expect(rows.filter((r) => r.story === "pause_mint")).toHaveLength(1);
    expect(rows.filter((r) => r.story === "never_attested")).toHaveLength(1);
    expect(
      custodyFor("demo")
        .custody.map((r) => r.story)
        .sort(),
    ).toEqual(["breached", "healthy", "healthy", "healthy", "stale", "thin"]);
  });

  it("give healthy 100 to 110 percent, thin just inside the tolerance, breached below the line", () => {
    for (const r of rows) {
      const id = `${r.story} ${r.representationId}`;
      if (r.story === "healthy") {
        expect(r.coverBps, id).toBeGreaterThanOrEqual(10_000);
        expect(r.coverBps, id).toBeLessThanOrEqual(11_000);
      }
      if (r.story === "thin") {
        expect(withinLimit(r), id).toBe(true);
        expect(r.coverBps, id).toBeLessThan(10_000);
        expect(10_000 - (r.coverBps ?? 0), id).toBeLessThanOrEqual(r.policy.toleranceBps);
      }
      if (r.story === "breached" || r.story === "warn_only") expect(withinLimit(r), id).toBe(false);
    }
  });

  it("restrict conversions on breach, stale and never attested; flag only on warn_only; never attest never_attested", () => {
    const action = (story: string) => rows.find((r) => r.story === story)?.policy.action;
    expect(action("breached")).toBe("restrict_conversions");
    expect(action("stale")).toBe("restrict_conversions");
    expect(action("never_attested")).toBe("restrict_conversions");
    expect(action("warn_only")).toBe("warn");
    expect(action("pause_mint")).toBe("pause_mint");
    expect(rows.filter((r) => r.coverBps === null).map((r) => r.story)).toEqual(["never_attested"]);
  });
});
