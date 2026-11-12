import { ratioBetween, rationalToWire } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import {
  CLAIMS,
  ISSUERS,
  RELATIONSHIPS,
  REPRESENTATIONS,
  issuerOf,
  tokenAccount,
  unitMultiplier,
} from "../lib/catalogue.ts";
import { smallestUnits } from "../lib/catalogue-plan.ts";
import { find, plan } from "./catalogue-fixtures.ts";

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

describe("catalogue units", () => {
  it("derives each multiplier from the whole-token unit count and the decimals", () => {
    for (const rep of REPRESENTATIONS) {
      const m = unitMultiplier(rep);
      expect(m.num * 10n ** BigInt(rep.decimals) * rep.unitsPerToken.den).toBe(
        m.den * rep.unitsPerToken.num,
      );
    }
    expect(rationalToWire(unitMultiplier(find("tacme-m")))).toEqual({
      num: "1",
      den: "1000000000",
    });
    expect(rationalToWire(unitMultiplier(find("tvilla-1")))).toEqual({ num: "1", den: "1" });
  });

  it("derives each relationship ratio from the two multipliers (ADR 0001)", () => {
    const ratios = Object.fromEntries(
      plan.relationships.map((r) => [r.pair.representation_a_id, r.ratio]),
    );
    expect(ratios["tacme-h"]).toEqual({ num: "1000", den: "1" });
    expect(ratios["tustb-h"]).toEqual({ num: "100", den: "1" });
    for (const rel of RELATIONSHIPS) {
      const [a, b] = [find(rel.a), find(rel.b)];
      expect(rel.a < rel.b, `${rel.a}:${rel.b} sorted`).toBe(true);
      expect(a.claimId).toBe(rel.claimId);
      expect(b.claimId).toBe(rel.claimId);
      const derived = ratioBetween(unitMultiplier(a), unitMultiplier(b));
      expect(plan.relationships.find((r) => r.pair.representation_a_id === rel.a)?.ratio).toEqual(
        rationalToWire(derived),
      );
    }
  });

  it("scales supplies by decimals, and the villa is exactly one token", () => {
    expect(smallestUnits(2n, 6)).toBe(2_000_000n);
    const villa = plan.representations.find((r) => r.representation.id === "tvilla-1");
    expect(villa?.startingSupply).toBe(1n);
    expect(villa?.faucet).toBe(false);
    expect(find("tvilla-1")).toMatchObject({ decimals: 0, convertible: false, bridgeable: true });
  });
});
