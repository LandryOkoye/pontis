import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dossierEvidence, REPO_ROOT } from "../lib/evidence.ts";
import { MULTIPLIER_A, MULTIPLIER_B, RATIO_A_TO_B, buildSeed } from "../lib/seed-data.ts";

describe("seed data", () => {
  const seed = buildSeed({ tokenA: "tgold-a.pontis.testnet", tokenB: "tgold-b.pontis.testnet" });

  it("derives the approved ratio from the unit multipliers: 1 A = 10 B (ADR 0001)", () => {
    expect(RATIO_A_TO_B).toEqual({ num: 1000n, den: 1n });
    expect(seed.compatibility.ratio).toEqual({ num: "1000", den: "1" });
    expect(seed.representations.map((r) => r.representation.unit_multiplier)).toEqual([
      { num: "1", den: MULTIPLIER_A.den.toString() },
      { num: "1", den: MULTIPLIER_B.den.toString() },
    ]);
  });

  it("labels every record synthetic and unverified (ADR 0009)", () => {
    const records = [
      ...seed.issuers,
      seed.canonicalAsset.asset,
      ...seed.representations.map((r) => r.representation),
    ];
    for (const r of records)
      expect([r.synthetic, r.verification_status]).toEqual([true, "unverified"]);
  });

  it("names the tokens SYNTHETIC TEST and keeps the dossier decimals", () => {
    const [a, b] = seed.representations.map((r) => r.representation);
    expect([a?.decimals, b?.decimals]).toEqual([6, 8]);
    expect(
      seed.representations.every((r) => r.representation.account_id.endsWith(".pontis.testnet")),
    ).toBe(true);
  });

  it("hashes the dossier file content for evidence", () => {
    const e = dossierEvidence("TGOLD-A");
    const expected = createHash("sha256")
      .update(readFileSync(`${REPO_ROOT}/docs/asset-dossiers/TGOLD-A.md`))
      .digest("hex");
    expect(e.sha256).toBe(expected);
    expect(e.provenance).toBe("issuer_provided");
  });
});
