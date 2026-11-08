import { describe, expect, it } from "vitest";
import { ChainEvidenceSchema, ChainIssuerSchema } from "../src/schemas.ts";

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
});
