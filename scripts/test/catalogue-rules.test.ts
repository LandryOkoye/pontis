import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLAIMS, ISSUERS, RELATIONSHIPS, REPRESENTATIONS, issuerOf } from "../lib/catalogue.ts";
import { REPO_ROOT } from "../lib/evidence.ts";
import { find, plan, sha256 } from "./catalogue-fixtures.ts";

describe("catalogue evidence and trust states", () => {
  it("hashes the dossier file content for every piece of evidence", () => {
    const all = [
      ...plan.issuers.map((i) => i.evidence),
      ...plan.claims.map((c) => c.evidence),
      ...plan.representations.map((r) => r.evidence),
      ...plan.relationships.map((r) => r.evidence),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) {
      expect(existsSync(`${REPO_ROOT}/${e.uri}`), e.uri).toBe(true);
      expect(e.sha256).toBe(sha256(e.uri));
      expect(e.provenance).toBe("issuer_provided");
    }
    for (const c of CLAIMS)
      expect(existsSync(`${REPO_ROOT}/docs/asset-dossiers/${c.dossier}.md`)).toBe(true);
  });

  it("claims no more verification than ADR 0009 and the contract allow", () => {
    const records = [
      ...plan.issuers.map((i) => i.record),
      ...plan.claims.map((c) => c.asset),
      ...plan.representations.map((r) => r.representation),
    ];
    for (const r of records) {
      expect(r.synthetic).toBe(true);
      // No third party and no authenticated verifier exist: only these two are honest.
      expect(["unverified", "issuer_attested"]).toContain(r.verification_status);
    }
    const issuerStatus = Object.fromEntries(
      plan.issuers.map((i) => [i.record.id, i.record.verification_status]),
    );
    expect(issuerStatus).toEqual({
      "halcyon-securities": "issuer_attested",
      "meridian-assets": "unverified",
      "orchard-trust": "issuer_attested",
      "vantage-credit": "unverified",
    });
    for (const rep of plan.representations) {
      expect(rep.representation.verification_status).toBe(
        issuerStatus[rep.representation.issuer_id],
      );
      expect(rep.evidence.sha256).toHaveLength(64);
    }
  });

  it("names every token SYNTHETIC TEST, as the token contract requires", () => {
    for (const rep of REPRESENTATIONS) expect(rep.name).toContain("SYNTHETIC TEST");
  });

  it("limits the issuers' controlled accounts to the tokens they hold", () => {
    const controlled = Object.fromEntries(
      plan.issuers.map((i) => [i.record.id, i.record.controlled_accounts]),
    );
    expect(controlled["vantage-credit"]).toEqual([]);
    expect(controlled["meridian-assets"]).toEqual([
      "tacme-m.pontis.testnet",
      "tnova-m.pontis.testnet",
    ]);
    expect(controlled["orchard-trust"]).toEqual(["tustb-o.pontis.testnet"]);
  });
});

describe("catalogue follows the contract's registry rules", () => {
  const activates = (repId: string) => issuerOf(find(repId)).activate;

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

  it("holds no representation under a rejected issuer, which could never be activated", () => {
    for (const issuer of ISSUERS.filter((i) => i.finalStatus === "rejected")) {
      expect(REPRESENTATIONS.filter((r) => r.issuerId === issuer.id)).toEqual([]);
    }
  });

  it("approves a relationship only where both representations can be active", () => {
    for (const rel of RELATIONSHIPS) {
      expect(rel.approve).toBe(activates(rel.a) && activates(rel.b));
    }
    expect(RELATIONSHIPS.map((r) => [r.a, r.approve])).toEqual([
      ["tacme-h", false],
      ["tustb-h", true],
    ]);
  });

  it("funds a vault only for representations with an approved relationship", () => {
    const approved = new Set(RELATIONSHIPS.filter((r) => r.approve).flatMap((r) => [r.a, r.b]));
    for (const rep of REPRESENTATIONS) {
      expect(rep.vaultInventory > 0n, rep.id).toBe(approved.has(rep.id));
      expect(rep.vaultInventory <= rep.startingSupply, rep.id).toBe(true);
    }
  });

  it("puts bridge hints only on tokens whose issuer is active", () => {
    for (const rep of REPRESENTATIONS.filter((r) => r.bridgeable)) {
      expect(issuerOf(rep).finalStatus, rep.id).toBe("active");
    }
  });
});
