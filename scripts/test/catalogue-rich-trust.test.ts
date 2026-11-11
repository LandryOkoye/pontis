// Trust, authorization, relationships and labelling of the full catalogue (ADR 0019 section 3):
// issuer authorization, derived ratios, no verification above issuer_attested, every record
// synthetic, and no real brand or ticker.

import { ratioBetween, rationalToWire } from "@pontis/domain";
import { describe, expect, it } from "vitest";
import { tokenAccount, unitMultiplier } from "../lib/catalogue.ts";
import { executable, repStatus } from "../lib/dossier-format.ts";
import { full, issuerOf, plan, rich } from "./catalogue-rich-fixtures.ts";
import { REAL_BRAND_DENYLIST, REAL_TICKER_DENYLIST } from "./real-brands.ts";

describe("full catalogue trust and authorization", () => {
  it("lets each representation's issuer issue its claim's category", () => {
    for (const rep of full.representations) {
      const claim = full.claims.find((c) => c.id === rep.claimId);
      expect(issuerOf(rep.issuerId).authorizedCategories, rep.id).toContain(claim?.category);
    }
  });

  it("claims no more verification than issuer_attested, and labels every record synthetic", () => {
    const records = [
      ...plan.issuers.map((i) => i.record),
      ...plan.claims.map((c) => c.asset),
      ...plan.representations.map((r) => r.representation),
    ];
    for (const r of records) {
      expect(r.synthetic).toBe(true);
      expect(["unverified", "issuer_attested"]).toContain(r.verification_status);
    }
    for (const e of [
      ...plan.issuers.map((i) => i.evidence),
      ...plan.claims.map((c) => c.evidence),
      ...plan.representations.map((r) => r.evidence),
      ...plan.relationships.map((r) => r.evidence),
    ]) {
      expect(e.provenance).toBe("issuer_provided");
    }
    const status = Object.fromEntries(
      plan.issuers.map((i) => [i.record.id, i.record.verification_status]),
    );
    for (const rep of plan.representations) {
      expect(rep.representation.verification_status).toBe(status[rep.representation.issuer_id]);
    }
  });

  it("moves records only along transitions a registrar may request", () => {
    // Status::registrar_may_move in contracts/pontis-core/src/types.rs.
    const allowed = [
      "restricted>active",
      "restricted>rejected",
      "restricted>deprecated",
      "active>restricted",
      "active>deprecated",
    ];
    for (const issuer of full.issuers) {
      let at: string = "restricted";
      for (const to of [issuer.activate ? "active" : at, issuer.finalStatus]) {
        if (to === at) continue;
        expect(allowed, `${issuer.id} ${at}>${to}`).toContain(`${at}>${to}`);
        at = to;
      }
    }
    for (const rep of full.representations.filter((r) => r.finalStatus === "deprecated")) {
      expect(issuerOf(rep.issuerId).activate, rep.id).toBe(true);
    }
  });

  it("registers no representation under a rejected issuer, which could never be activated", () => {
    for (const issuer of full.issuers.filter((i) => i.finalStatus === "rejected")) {
      expect(full.representations.filter((r) => r.issuerId === issuer.id)).toEqual([]);
    }
  });

  it("limits each issuer's controlled accounts to the tokens it issues", () => {
    for (const issuer of plan.issuers) {
      const own = full.representations
        .filter((r) => r.issuerId === issuer.record.id)
        .map((r) => tokenAccount(r.id, "pontis.testnet"));
      expect(issuer.record.controlled_accounts).toEqual(own);
    }
  });
});

describe("full catalogue relationships", () => {
  const rep = (id: string) => {
    const found = full.representations.find((r) => r.id === id);
    if (!found) throw new Error(`no representation ${id}`);
    return found;
  };

  it("derives every pair's ratio from the two unit multipliers", () => {
    expect(plan.relationships).toHaveLength(full.relationships.length);
    for (const [i, rel] of full.relationships.entries()) {
      const planned = plan.relationships[i];
      expect(rel.a < rel.b, `${rel.a}:${rel.b} sorted`).toBe(true);
      expect(planned?.ratio).toEqual(
        rationalToWire(ratioBetween(unitMultiplier(rep(rel.a)), unitMultiplier(rep(rel.b)))),
      );
      if ((rel.classification ?? "DIRECT_EQUIVALENT") === "DIRECT_EQUIVALENT") {
        expect(rep(rel.a).claimId, `${rel.a}:${rel.b} same claim`).toBe(rep(rel.b).claimId);
      }
    }
  });

  it("approves only pairs whose tokens are activated, and never rejects an approved pair", () => {
    for (const rel of full.relationships) {
      const [a, b] = [rep(rel.a), rep(rel.b)];
      if (rel.approve) {
        expect(
          issuerOf(a.issuerId).activate && issuerOf(b.issuerId).activate,
          `${rel.a}:${rel.b}`,
        ).toBe(true);
        expect(rel.review).toBeUndefined();
        expect(rel.classification ?? "DIRECT_EQUIVALENT").toBe("DIRECT_EQUIVALENT");
      }
      if (rel.review) expect(rel.approve).toBe(false);
      if (rel.guard) expect(rel.approve).toBe(true);
    }
  });

  it("funds a vault only for representations of an approved pair, within the supply", () => {
    const approved = new Set(
      full.relationships.filter((r) => r.approve).flatMap((r) => [r.a, r.b]),
    );
    // Phase 1 funds only the tustb pair; a phase 1 token the rich entries pair up stays unfunded.
    const baseUnfunded = new Set(["tcredit-1", "tusd-h"]);
    for (const r of full.representations) {
      if (baseUnfunded.has(r.id)) {
        expect(r.vaultInventory, r.id).toBe(0n);
        continue;
      }
      expect(r.vaultInventory > 0n, r.id).toBe(approved.has(r.id));
      expect(r.vaultInventory <= r.startingSupply, r.id).toBe(true);
    }
  });

  it("makes unique assets one indivisible, non-convertible token", () => {
    for (const r of full.representations.filter((x) => x.decimals === 0)) {
      expect(r.startingSupply).toBe(1n);
      expect([r.faucet, r.convertible]).toEqual([false, false]);
      expect(full.relationships.some((rel) => rel.a === r.id || rel.b === r.id)).toBe(false);
    }
  });

  it("says which tokens cannot convert, and that is exactly those whose issuer is not active", () => {
    for (const r of full.representations) {
      const issuer = issuerOf(r.issuerId);
      expect(executable(r, issuer)).toBe(
        issuer.finalStatus === "active" && repStatus(r, issuer) === "active",
      );
    }
  });
});

describe("no real brand, ticker or product", () => {
  const norm = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const names = [
    ...full.issuers.map((i) => i.name),
    ...full.claims.map((c) => c.name),
    ...full.representations.map((r) => r.name),
    ...rich.issuers.map((i) => i.id),
    ...rich.claims.map((c) => c.id),
    ...rich.claims.flatMap((c) => [c.claimDescription, c.story]),
    ...rich.issuers.map((i) => i.story),
  ];

  it("collides with no denylisted real name", () => {
    const hay = ` ${names.map(norm).join(" | ")} `;
    for (const brand of REAL_BRAND_DENYLIST) {
      expect(hay.includes(` ${norm(brand)} `), `"${brand}" appears in the catalogue`).toBe(false);
    }
  });

  it("uses no denylisted real ticker as a symbol, and every symbol is T-prefixed", () => {
    const tickers = new Set(REAL_TICKER_DENYLIST.map((t) => t.toLowerCase()));
    for (const r of rich.representations) {
      const symbol = r.symbol.toLowerCase();
      expect(tickers.has(symbol.replace(/-/g, "")), r.symbol).toBe(false);
      expect(tickers.has(symbol), r.symbol).toBe(false);
      expect(r.symbol.startsWith("T"), r.symbol).toBe(true);
    }
  });

  it("gives each rich issuer a contact on the reserved .example domain", () => {
    for (const i of rich.issuers) expect(i.contact).toMatch(/@[a-z0-9-]+\.example\b/);
  });
});
