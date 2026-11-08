import { describe, expect, it } from "vitest";
import * as fx from "../src/fixtures.ts";
import {
  ChainCompatibilitySchema,
  ChainEvidenceSchema,
  ChainIssuerSchema,
  ChainRepresentationSchema,
} from "../src/schemas.ts";

const evidence = {
  uri: "docs/asset-dossiers/TGOLD-A.md",
  sha256: "a".repeat(64),
  provenance: "issuer_provided",
  description: "Self-attested",
  added_by: "owner.testnet",
  timestamp_ms: 1_794_074_400_000,
};

const issuer = {
  id: "synthetic-issuer-a",
  name: "Synthetic Issuer A",
  jurisdiction: null,
  authorized_categories: ["synthetic test claims"],
  controlled_accounts: [],
  contact: null,
  evidence: [evidence],
  registered_by: "owner.testnet",
  registered_at_ms: 1_794_074_400_000,
  last_reviewed_ms: null,
  synthetic: true,
  verification_status: "unverified",
  status: "active",
};

describe("chain schemas", () => {
  it("accepts a registry record as the contract serialises it", () => {
    expect(ChainIssuerSchema.parse(issuer).status).toBe("active");
  });

  it.each([
    ["a short sha256", { ...evidence, sha256: "abc" }],
    ["an unknown provenance", { ...evidence, provenance: "trust_me" }],
    ["a fractional timestamp", { ...evidence, timestamp_ms: 1.5 }],
  ])("rejects evidence with %s", (_name, value) => {
    expect(ChainEvidenceSchema.safeParse(value).success).toBe(false);
  });

  it("rejects an issuer with an unknown status or a missing flag", () => {
    expect(ChainIssuerSchema.safeParse({ ...issuer, status: "live" }).success).toBe(false);
    const { synthetic: _omitted, ...withoutFlag } = issuer;
    expect(ChainIssuerSchema.safeParse(withoutFlag).success).toBe(false);
  });

  it("keeps amounts and ratios as canonical decimal strings", () => {
    const rep = {
      id: "tgold-a",
      canonical_asset_id: "syn-gold-oz",
      issuer_id: "synthetic-issuer-a",
      account_id: "tgold-a.testnet",
      name: "SYNTHETIC TEST Gold A",
      symbol: "TGOLD-A",
      decimals: 6,
      unit_multiplier: { num: "1", den: "1000000" },
      admin_capabilities: [],
      custody_description: "None",
      redemption_mechanism: "None",
      transfer_policy_summary: "Allowlist",
      bridge_status: "none",
      evidence: [],
      registered_by: "owner.testnet",
      registered_at_ms: 1,
      last_reviewed_ms: null,
      synthetic: true,
      verification_status: "unverified",
      status: "restricted",
    };
    expect(ChainRepresentationSchema.parse(rep).unit_multiplier.den).toBe("1000000");
    expect(
      ChainRepresentationSchema.safeParse({ ...rep, unit_multiplier: { num: 1, den: "1" } })
        .success,
    ).toBe(false);
    expect(ChainRepresentationSchema.safeParse({ ...rep, decimals: 39 }).success).toBe(false);
  });

  it("accepts every fixture, so tests and the contract stay in step", () => {
    for (const i of fx.issuers) ChainIssuerSchema.parse(i);
    for (const r of fx.representations) ChainRepresentationSchema.parse(r);
    for (const c of fx.compatibilities) ChainCompatibilitySchema.parse(c);
  });
});
