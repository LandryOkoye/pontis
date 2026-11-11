import { describe, expect, it } from "vitest";
import { CLAIMS, ISSUERS, REPRESENTATIONS, issuerOf, tokenAccount } from "../lib/catalogue.ts";

describe("catalogue representations", () => {
  it("names exactly the fixed representation ids, with unique ids and symbols", () => {
    const ids = REPRESENTATIONS.map((r) => r.id);
    expect([...ids].sort()).toEqual(
      [
        "tacme-h",
        "tacme-m",
        "tcredit-1",
        "tnova-m",
        "tusd-h",
        "tustb-h",
        "tustb-o",
        "tvilla-1",
      ].sort(),
    );
    expect(new Set(REPRESENTATIONS.map((r) => r.symbol)).size).toBe(ids.length);
  });

  it("collides with no MVP id", () => {
    const mvp = ["synthetic-issuer-a", "synthetic-issuer-b", "syn-gold-oz", "tgold-a", "tgold-b"];
    const ids = [...ISSUERS, ...CLAIMS, ...REPRESENTATIONS].map((r) => r.id);
    expect(ids.filter((id) => mvp.includes(id))).toEqual([]);
  });

  it("gives every representation an existing claim and an issuer authorized for its category", () => {
    for (const rep of REPRESENTATIONS) {
      const claim = CLAIMS.find((c) => c.id === rep.claimId);
      expect(claim, `${rep.id} claim`).toBeDefined();
      expect(issuerOf(rep).authorizedCategories, rep.id).toContain(claim?.category);
    }
  });

  it("gives every claim at least one representation", () => {
    for (const claim of CLAIMS) {
      expect(
        REPRESENTATIONS.some((r) => r.claimId === claim.id),
        claim.id,
      ).toBe(true);
    }
  });

  it("names every token SYNTHETIC TEST, as the token contract requires", () => {
    for (const rep of REPRESENTATIONS) expect(rep.name).toContain("SYNTHETIC TEST");
  });

  it("derives a distinct account under the deployer from each representation id", () => {
    expect(tokenAccount("tacme-h", "pontis.testnet")).toBe("tacme-h.pontis.testnet");
    const accounts = REPRESENTATIONS.map((r) => tokenAccount(r.id, "pontis.testnet"));
    expect(new Set(accounts).size).toBe(accounts.length);
  });
});
