import { DEFAULT_CLAIMS } from "@pontis/market-data";
import { describe, expect, it } from "vitest";
import { CATEGORY, CLAIMS, ISSUERS } from "../lib/catalogue.ts";

describe("catalogue issuers", () => {
  it("has exactly the four simulated issuers, with unique ids", () => {
    const ids = ISSUERS.map((i) => i.id);
    expect(ids).toEqual([
      "halcyon-securities",
      "meridian-assets",
      "orchard-trust",
      "vantage-credit",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only trust states the contract and ADR 0009 allow today", () => {
    // No third party exists and the contract refuses independently_verified, so neither appears.
    expect(Object.fromEntries(ISSUERS.map((i) => [i.id, [i.verification, i.finalStatus]]))).toEqual(
      {
        "halcyon-securities": ["issuer_attested", "active"],
        "meridian-assets": ["unverified", "restricted"],
        "orchard-trust": ["issuer_attested", "deprecated"],
        "vantage-credit": ["unverified", "rejected"],
      },
    );
  });

  it("moves issuers only along transitions a registrar may request", () => {
    // Status::registrar_may_move in contracts/pontis-core/src/types.rs.
    const allowed = [
      "restricted>active",
      "restricted>rejected",
      "restricted>deprecated",
      "active>restricted",
      "active>deprecated",
    ];
    for (const issuer of ISSUERS) {
      let at: string = "restricted";
      for (const to of [issuer.activate ? "active" : at, issuer.finalStatus]) {
        if (to === at) continue;
        expect(allowed, `${issuer.id} ${at}>${to}`).toContain(`${at}>${to}`);
        at = to;
      }
    }
  });

  it("authorizes each issuer only for categories the catalogue uses", () => {
    for (const issuer of ISSUERS) {
      for (const category of issuer.authorizedCategories) {
        expect(Object.values(CATEGORY)).toContain(category);
      }
    }
  });
});

describe("catalogue canonical assets", () => {
  it("has unique ids and covers every default simulated profile except the MVP gold", () => {
    const ids = CLAIMS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(
      Object.keys(DEFAULT_CLAIMS)
        .filter((id) => id !== "syn-gold-oz")
        .sort(),
    );
  });

  it("puts each claim in a category some issuer is authorized for", () => {
    for (const claim of CLAIMS) {
      expect(Object.values(CATEGORY)).toContain(claim.category);
      expect(
        ISSUERS.some((i) => i.authorizedCategories.includes(claim.category)),
        claim.id,
      ).toBe(true);
    }
  });

  it("fills every field of the record and claims no rights, legal structure or backing", () => {
    for (const claim of CLAIMS) {
      for (const text of [
        claim.name,
        claim.claimDescription,
        claim.unitDefinition,
        claim.redemptionTerms,
        claim.eligibilityRestrictions,
      ]) {
        expect(text.trim().length, claim.id).toBeGreaterThan(0);
      }
      expect(claim.economicRights, claim.id).toMatch(/^None/);
      expect(claim.legalClaimStructure, claim.id).toMatch(/^None/);
      expect(claim.riskDisclosures.length, claim.id).toBeGreaterThan(0);
    }
  });
});
