import { describe, expect, it } from "vitest";
import { CATEGORY, ISSUERS } from "../lib/catalogue.ts";

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
