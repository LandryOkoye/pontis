import { describe, expect, it } from "vitest";
import * as fx from "../src/fixtures.ts";
import {
  CreateMintRequestSchema,
  FulfilRedemptionRequestSchema,
  IssuerRedemptionListSchema,
  MintIntentSchema,
  MintRequestListSchema,
  MintRequestSchema,
  PrepareRedemptionRequestSchema,
  PrepareRedemptionResponseSchema,
  RedemptionIntentSchema,
  RejectRedemptionRequestSchema,
  ReserveMonitorReportSchema,
} from "../src/index.ts";

const responses = [
  ["prepare response", PrepareRedemptionResponseSchema, fx.prepareRedemptionResponse],
  ["redemption intent", RedemptionIntentSchema, fx.redemptionIntent],
  ["issuer queue", IssuerRedemptionListSchema, fx.issuerRedemptionList],
  ["mint request", MintRequestSchema, fx.mintRequest],
  ["mint request list", MintRequestListSchema, fx.mintRequestList],
  ["mint intent", MintIntentSchema, fx.mintIntent],
  ["reserve monitor", ReserveMonitorReportSchema, fx.reserveMonitorReport],
] as const;

describe("session endpoint fixtures", () => {
  it.each(responses)("%s passes its schema and says it is simulated", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
    expect(value.simulated).toBe(true);
    expect(value.notice).toMatch(/simulated/i);
  });

  it("keeps the redeem message in step with the two hashes it quotes", () => {
    const r = fx.prepareRedemptionResponse;
    expect(r.msg).toBe(`redeem:${r.termsHash}:${r.payoutInstructionHash}`);
    expect(r.actions[0]?.args.msg).toBe(r.msg);
  });

  it("has no field that could carry a payout instruction in any response", () => {
    for (const [, , value] of responses)
      expect(JSON.stringify(value)).not.toMatch(/ciphertext|payoutInstruction"/);
  });
});

describe("PrepareRedemptionRequest", () => {
  const ok = { representationId: "tgold-a", amount: "5000000", payoutInstruction: "AAECAwQFBgc=" };

  it("takes base64 ciphertext and an optional terms hash", () => {
    expect(PrepareRedemptionRequestSchema.safeParse(ok).success).toBe(true);
    expect(
      PrepareRedemptionRequestSchema.safeParse({ ...ok, termsHash: "a".repeat(64) }).success,
    ).toBe(true);
  });

  it.each([
    ["zero amount", { amount: "0" }],
    ["decimal amount", { amount: "1.5" }],
    ["plain text instruction", { payoutInstruction: "IBAN CH93 0076 2011" }],
    ["unpadded base64", { payoutInstruction: "AAECAwQFBgc" }],
    ["empty instruction", { payoutInstruction: "" }],
    ["uppercase terms hash", { termsHash: "A".repeat(64) }],
    ["an unknown field", { extra: 1 }],
  ])("refuses %s", (_name, over) => {
    expect(PrepareRedemptionRequestSchema.safeParse({ ...ok, ...over }).success).toBe(false);
  });
});

describe("issuer request bodies", () => {
  it("limits a reject reason to 1..64 bytes, counting UTF-8 bytes", () => {
    expect(RejectRedemptionRequestSchema.safeParse({ reason: "not eligible" }).success).toBe(true);
    expect(RejectRedemptionRequestSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(RejectRedemptionRequestSchema.safeParse({ reason: "x".repeat(65) }).success).toBe(false);
    expect(RejectRedemptionRequestSchema.safeParse({ reason: "é".repeat(33) }).success).toBe(false);
  });

  it("wants evidence as 64 lowercase hex characters", () => {
    expect(FulfilRedemptionRequestSchema.safeParse({ evidenceHash: "e".repeat(64) }).success).toBe(
      true,
    );
    expect(FulfilRedemptionRequestSchema.safeParse({ evidenceHash: "E".repeat(64) }).success).toBe(
      false,
    );
  });

  it("defaults a mint reference to empty and refuses zero, long references and bad recipients", () => {
    const base = { representationId: "tgold-a", recipient: "alice.testnet", amount: "5" };
    expect(CreateMintRequestSchema.parse(base).reference).toBe("");
    expect(CreateMintRequestSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(CreateMintRequestSchema.safeParse({ ...base, reference: "r".repeat(65) }).success).toBe(
      false,
    );
    expect(CreateMintRequestSchema.safeParse({ ...base, recipient: "Alice!" }).success).toBe(false);
  });
});
