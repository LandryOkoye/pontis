import { describe, expect, it } from "vitest";
import * as fx from "../src/fixtures.ts";
import {
  AssetCustodySchema,
  AssetRedemptionTermsSchema,
  AssetReservesSchema,
  CustodianListSchema,
  CustodianSchema,
  IssuerReliabilitySchema,
  ListRedemptionsQuerySchema,
  RedemptionListSchema,
  RedemptionSchema,
  ReserveHistorySchema,
  SubmitReserveAttestationRequestSchema,
} from "../src/index.ts";

const labelled = [
  ["custodian", CustodianSchema, fx.custodian],
  ["custodian list", CustodianListSchema, fx.custodianList],
  ["custody", AssetCustodySchema, fx.assetCustody],
  ["reserves", AssetReservesSchema, fx.assetReserves],
  ["reserve history", ReserveHistorySchema, fx.reserveHistory],
  ["redemption terms", AssetRedemptionTermsSchema, fx.assetRedemptionTerms],
  ["issuer reliability", IssuerReliabilitySchema, fx.issuerReliability],
  ["redemption", RedemptionSchema, fx.redemption],
  ["redemption list", RedemptionListSchema, fx.redemptionList],
] as const;

describe("custody, reserve and redemption fixtures", () => {
  it.each(labelled)("%s passes its schema", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each(labelled)("%s carries the honesty labels, which are required", (_name, schema, value) => {
    expect(value.simulated).toBe(true);
    expect(value.sources.length).toBeGreaterThan(0);
    expect(value.notice).toMatch(/simulated/i);
    for (const key of ["simulated", "sources", "notice"]) {
      const { [key as keyof typeof value]: _dropped, ...rest } = value;
      expect(schema.safeParse(rest).success).toBe(false);
    }
  });

  it("never words a fixture as backed, audited or verified", () => {
    const text = JSON.stringify(labelled.map(([, , v]) => v)).toLowerCase();
    expect(text).not.toMatch(/fully backed|is backed|audited by|verified reserves/);
  });
});

describe("custody request schemas", () => {
  it("takes a redemption listing filtered by status and refuses a made-up status", () => {
    expect(
      ListRedemptionsQuerySchema.parse({ user: "alice.testnet", status: "accepted" }),
    ).toMatchObject({
      limit: 25,
    });
    expect(ListRedemptionsQuerySchema.safeParse({ status: "paid" }).success).toBe(false);
    expect(ListRedemptionsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  const body = {
    attestation: {
      version: 1,
      contract: "core.testnet",
      representationId: "tgold-a",
      custodianId: "vault-co-sim",
      reservedUnits: "1000",
      asOfMs: 1,
      reportHash: "e".repeat(64),
      reportUri: "sim://r",
      simulated: true,
      source: "simulated_custodian",
    },
    signature: "AAAA",
    publicKey: "ed25519:6E8bAu1MUKRDM9dvKGbgYxEFJt4sr4Z5k1QYtUwrBXRp",
  };

  it("takes a signed attestation and refuses a bad hash, a version other than 1 and a float amount", () => {
    expect(SubmitReserveAttestationRequestSchema.safeParse(body).success).toBe(true);
    for (const attestation of [
      { ...body.attestation, reportHash: "abc" },
      { ...body.attestation, version: 2 },
      { ...body.attestation, reservedUnits: "1.5" },
      { ...body.attestation, simulated: undefined },
    ]) {
      expect(
        SubmitReserveAttestationRequestSchema.safeParse({ ...body, attestation }).success,
      ).toBe(false);
    }
  });
});
