import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogueFor, richFor } from "../lib/catalogue-tiers.ts";
import { renderDossiers } from "../lib/dossier-files.ts";
import { dossierEvidence, REPO_ROOT } from "../lib/evidence.ts";
import { REAL_BRAND_DENYLIST, REAL_CUSTODIAN_DENYLIST } from "./real-brands.ts";

const read = (path: string) => readFileSync(`${REPO_ROOT}/${path}`, "utf8");
const rich = richFor("full");
const readme = read("docs/asset-dossiers/README.md");

describe("generated dossiers", () => {
  it(
    "match the catalogue data exactly, so a dossier cannot drift from its record",
    { timeout: 60_000 },
    async () => {
      // Run `pnpm --filter @pontis/scripts gen-dossiers` after editing catalogue-rich-*.ts.
      const files = await renderDossiers(readme);
      expect(files.length).toBe(rich.issuers.length + rich.claims.length + 1);
      for (const file of files) {
        expect(read(file.path), file.path).toBe(file.content);
      }
    },
  );

  it("exist for every issuer and every claim of the full catalogue, and the README lists them", () => {
    for (const record of [...rich.issuers, ...rich.claims]) {
      expect(existsSync(`${REPO_ROOT}/docs/asset-dossiers/${record.dossier}.md`), record.id).toBe(
        true,
      );
      expect(readme, record.dossier).toContain(`[${record.dossier}](${record.dossier}.md)`);
      expect(readme, record.id).toContain(`\`${record.id}\``);
    }
  });

  it("says plainly that it is fictional demo data and claims no verification", () => {
    for (const record of [...rich.issuers, ...rich.claims]) {
      const text = read(`docs/asset-dossiers/${record.dossier}.md`);
      expect(text, record.id).toContain("FICTIONAL DEMO DATA");
      expect(text, record.id).toContain("`issuer_provided`");
      expect(text, record.id).toMatch(/UNBACKED/);
      expect(text, record.id).not.toMatch(/third_party_attested|independently_verified/);
    }
  });

  it("names no real company, fund or token", () => {
    const norm = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    for (const record of [...rich.issuers, ...rich.claims]) {
      const text = norm(read(`docs/asset-dossiers/${record.dossier}.md`));
      for (const brand of REAL_BRAND_DENYLIST) {
        expect(
          text.includes(` ${brand.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `),
          `${record.id}: ${brand}`,
        ).toBe(false);
      }
    }
  });

  it("gives every claim dossier a simulated custody section, with the empty state where there is none", () => {
    for (const claim of rich.claims) {
      const text = read(`docs/asset-dossiers/${claim.dossier}.md`);
      expect(text, claim.id).toContain("## Custody, reserves and redemption (simulated)");
      expect(text, claim.id).toContain("FICTIONAL DEMO DATA. SIMULATED CUSTODY AND RESERVES.");
      expect(text, claim.id).toContain(
        "Nothing is custodied, backed, audited, regulated or paid out",
      );
    }
    expect(read("docs/asset-dossiers/SYN-ART-CANVAS.md")).toContain(
      "the custody screens show their empty state",
    );
    expect(read("docs/asset-dossiers/SYN-GOLD-KG.md")).toContain("Lindenhall");
    expect(read("docs/asset-dossiers/SYN-EUR.md")).toMatch(/Ferncliff[\s\S]*`stale`/);
  });

  it("names no real custodian, vault operator or audit firm", () => {
    const norm = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
    for (const record of rich.claims) {
      const text = norm(read(`docs/asset-dossiers/${record.dossier}.md`));
      for (const name of REAL_CUSTODIAN_DENYLIST) {
        expect(text.includes(norm(name)), `${record.id}: ${name}`).toBe(false);
      }
    }
  });

  it("is what the seed hashes as evidence for every tier's records", () => {
    for (const tier of ["demo", "full"] as const) {
      for (const issuer of catalogueFor(tier).issuers) {
        const { uri, sha256 } = dossierEvidence(issuer.dossier);
        expect(sha256).toHaveLength(64);
        expect(existsSync(`${REPO_ROOT}/${uri}`)).toBe(true);
      }
    }
  });

  it("tells the stories it promises in the right dossiers", () => {
    expect(read("docs/asset-dossiers/SYN-STOCK-TARNOWSKI.md")).toContain(
      "Corporate action record (dossier only)",
    );
    expect(read("docs/asset-dossiers/SYN-NOTE-TRADE.md")).toMatch(/redemption gate/i);
    expect(read("docs/asset-dossiers/WATTLEBIRD-CAPITAL.md")).toContain(
      "The lapsed attestation is a narrative",
    );
    expect(read("docs/asset-dossiers/SYN-STOCK-MARLOWE.md")).toContain("Delisted on 2026-10-14");
  });
});
