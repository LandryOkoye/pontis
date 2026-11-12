// Size, coverage and identity of the full catalogue (phase 1 plus the rich entries, ADR 0019
// section 3): how many issuers, claims and tokens, which families and stories it tells, and that
// ids are unique and accepted by the contract.

import { SIMULATED_CLAIMS } from "@pontis/market-data";
import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { catalogueFor } from "../lib/catalogue-tiers.ts";
import { full, issuerOf, plan, rich, unique } from "./catalogue-rich-fixtures.ts";

/** The contract's id rule (contracts/pontis-core/src/types.rs validate_id). */
const CONTRACT_ID = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])$/;

describe("the full catalogue's size and coverage", () => {
  it("has at least 14 invented issuers in 8 jurisdictions, 30 claims and 40 representations", () => {
    expect(rich.issuers.length).toBeGreaterThanOrEqual(14);
    expect(new Set(rich.issuers.map((i) => i.jurisdiction)).size).toBeGreaterThanOrEqual(8);
    expect(full.claims.length).toBeGreaterThanOrEqual(30);
    expect(full.representations.length).toBeGreaterThanOrEqual(40);
  });

  it("covers every asset family the plan names", () => {
    const covered = (needle: RegExp) => full.claims.some((c) => needle.test(c.id));
    for (const family of [
      /tbill/, // short-dated treasury funds
      /mmf/, // money-market funds
      /gold/,
      /silver/,
      /cre-/, // commercial real estate
      /resi-|villa/, // residential real estate
      /note-|credit/, // private credit notes
      /igcorp/, // investment-grade corporate bond fund
      /idx-|basket/, // index trackers and baskets
      /stock-|acme|nova/, // single stocks
      /eur|jpy|usd/, // stable-value tokens
      /carbon/,
      /vc-|pe-/, // venture and private equity
      /art-|flat|villa/, // unique assets
      /oil|copper/, // commodities
    ]) {
      expect(covered(family), String(family)).toBe(true);
    }
  });

  it("gives every claim a simulated price profile, and every profile a claim of the catalogue", () => {
    for (const claim of full.claims) expect(SIMULATED_CLAIMS[claim.id], claim.id).toBeDefined();
    const ids = new Set(full.claims.map((c) => c.id));
    for (const id of Object.keys(SIMULATED_CLAIMS)) {
      // The MVP gold is simulated too but registered by the MVP seed, not the catalogue.
      if (id !== "syn-gold-oz") expect(ids.has(id), id).toBe(true);
    }
  });

  it("has wrappers with different decimals or unit multipliers, so conversion pairs exist", () => {
    const byClaim: Record<string, (typeof full.representations)[number][]> = {};
    for (const r of full.representations) (byClaim[r.claimId] ??= []).push(r);
    const multi = Object.values(byClaim).filter((reps) => reps.length >= 2);
    expect(multi.length).toBeGreaterThanOrEqual(15);
    const differing = multi.filter(
      (reps) =>
        new Set(reps.map((r) => r.decimals)).size > 1 ||
        new Set(reps.map((r) => `${r.unitsPerToken.num}/${r.unitsPerToken.den}`)).size > 1,
    );
    expect(differing.length).toBe(multi.length);
  });

  it("mixes pair outcomes: approved with guards, proposed, similar and rejected", () => {
    const kinds = new Set(
      full.relationships.map(
        (r) =>
          `${r.classification ?? "DIRECT_EQUIVALENT"}:${r.review === "reject" ? "rejected" : r.approve ? "approved" : "proposed"}`,
      ),
    );
    expect([...kinds].sort()).toEqual([
      "DIRECT_EQUIVALENT:approved",
      "DIRECT_EQUIVALENT:proposed",
      "DIRECT_EQUIVALENT:rejected",
      "ECONOMICALLY_SIMILAR:proposed",
    ]);
    const guarded = full.relationships.filter((r) => r.approve && r.guard);
    expect(guarded.length).toBeGreaterThanOrEqual(10);
    // Every pair in the plan that is approved carries a guard (the base pair is the one exception).
    for (const r of plan.relationships.filter((p) => p.approve)) {
      if (r.pair.representation_a_id === "tustb-h") continue;
      expect(r.guard, r.pair.representation_a_id).not.toBeNull();
    }
  });

  it("tells every story the plan names, each through data the seed can apply", () => {
    const statuses = new Set(full.issuers.map((i) => i.finalStatus));
    expect([...statuses].sort()).toEqual(["active", "deprecated", "rejected", "restricted"]);
    // Lapsed attestation: a deprecated issuer that had approved pairs.
    expect(
      full.issuers.filter((i) => i.finalStatus === "deprecated").length,
    ).toBeGreaterThanOrEqual(2);
    // Restricted issuer with pending tokens: never activated, tokens registered.
    const pending = full.issuers.filter((i) => i.finalStatus === "restricted" && !i.activate);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    for (const i of pending) {
      expect(full.representations.some((r) => r.issuerId === i.id)).toBe(true);
    }
    // A delisted asset: a wrapper moved to deprecated under an active issuer.
    const delisted = full.representations.filter((r) => r.finalStatus === "deprecated");
    expect(delisted.length).toBeGreaterThanOrEqual(1);
    for (const r of delisted) expect(issuerOf(r.issuerId).finalStatus).toBe("active");
    // A split in a dossier only, a redemption-gated note, unattested-but-active issuer.
    expect(rich.claims.some((c) => c.corporateAction?.includes("split"))).toBe(true);
    expect(rich.claims.some((c) => /redemption gate/i.test(c.redemptionTerms))).toBe(true);
    expect(
      full.issuers.some((i) => i.finalStatus === "active" && i.verification === "unverified"),
    ).toBe(true);
  });
});

describe("full catalogue identity", () => {
  it("has unique ids, symbols and token accounts across the whole catalogue and the MVP", () => {
    const mvp = ["synthetic-issuer-a", "synthetic-issuer-b", "syn-gold-oz", "tgold-a", "tgold-b"];
    const ids = [...full.issuers, ...full.claims, ...full.representations].map((r) => r.id);
    expect(unique(ids)).toBe(true);
    expect(ids.filter((id) => mvp.includes(id))).toEqual([]);
    expect(unique(full.representations.map((r) => r.symbol))).toBe(true);
    const accounts = full.representations.map((r) => tokenAccount(r.id, "pontis.testnet"));
    expect(unique(accounts)).toBe(true);
    for (const a of accounts) expect(a.length, a).toBeLessThanOrEqual(64);
  });

  it("uses only ids and texts the contract accepts", () => {
    for (const id of [...full.issuers, ...full.claims, ...full.representations].map((r) => r.id)) {
      expect(id, id).toMatch(CONTRACT_ID);
    }
    for (const claim of plan.claims) {
      for (const [field, text] of Object.entries(claim.asset)) {
        if (typeof text === "string")
          expect(text.length, `${claim.asset.id} ${field}`).toBeLessThanOrEqual(2_000);
      }
      expect(claim.asset.risk_disclosures.length).toBeLessThanOrEqual(32);
    }
    for (const issuer of plan.issuers) {
      expect(issuer.record.controlled_accounts.length).toBeLessThanOrEqual(32);
      expect(issuer.record.authorized_categories.length).toBeLessThanOrEqual(32);
    }
    for (const rep of full.representations) {
      expect(rep.name).toContain("SYNTHETIC TEST");
      expect(rep.decimals).toBeLessThanOrEqual(38);
    }
  });

  it("names no tier entry that is missing from a smaller tier's closure", () => {
    for (const tier of ["demo", "full"] as const) {
      const data = catalogueFor(tier);
      const issuers = new Set(data.issuers.map((i) => i.id));
      const claims = new Set(data.claims.map((c) => c.id));
      const reps = new Set(data.representations.map((r) => r.id));
      for (const r of data.representations) {
        expect(issuers.has(r.issuerId), `${tier} ${r.id} issuer`).toBe(true);
        expect(claims.has(r.claimId), `${tier} ${r.id} claim`).toBe(true);
      }
      for (const rel of data.relationships) {
        expect(reps.has(rel.a) && reps.has(rel.b), `${tier} ${rel.a}:${rel.b}`).toBe(true);
        expect(claims.has(rel.claimId)).toBe(true);
      }
      for (const c of data.claims) {
        expect(
          data.representations.some((r) => r.claimId === c.id),
          `${tier} ${c.id}`,
        ).toBe(true);
      }
    }
  });
});
