import { describe, expect, it } from "vitest";
import { PrivateRfqMatcher } from "../src/private-rfq.ts";
import { createRfqKeys, encryptOrder, type PrivateOrder } from "../src/private-crypto.ts";

const now = 1_800_000_000_000;
const order = (
  id: string,
  side: "buy" | "sell",
  limitPrice: string,
  createdAtMs = now - 10,
): PrivateOrder => ({
  id,
  institutionId: `${id}-institution`,
  assetId: "asset-a",
  side,
  size: "50",
  limitPrice,
  expiryMs: now + 10_000,
  createdAtMs,
});

describe("operator-trusted encrypted RFQ", () => {
  it("matches opposing encrypted orders and verifies counterpart and auditor disclosures", () => {
    const alice = createRfqKeys();
    const bob = createRfqKeys();
    const auditor = createRfqKeys();
    const matcher = new PrivateRfqMatcher({
      oraclePrice: () => 100n,
      maxOracleDeviationBps: 1_000n,
      auditorPublicKey: auditor.publicKey,
      now: () => now,
    });
    expect(
      matcher.submit(
        encryptOrder(order("sell-1", "sell", "100"), matcher.matcherPublicKey),
        alice.publicKey,
      ),
    ).toMatchObject({
      status: "resting",
      confidentiality_level: "operator_trusted",
      simulated: true,
    });
    const result = matcher.submit(
      encryptOrder(order("buy-1", "buy", "101"), matcher.matcherPublicKey),
      bob.publicKey,
    ).settlement!;
    expect(result).toMatchObject({
      size: "50",
      price: "100",
      simulated: true,
      confidentiality_level: "operator_trusted",
    });
    expect(matcher.openDisclosure(result!.settlementId, alice.secretKey)).toMatchObject({
      commitment: result!.commitment,
    });
    expect(matcher.openDisclosure(result!.settlementId, auditor.secretKey)).toMatchObject({
      commitment: result!.commitment,
    });
    expect(result!.settlementMode).toBe("not_submitted");
  });

  it("rejects modified ciphertext and replayed orders", () => {
    const participant = createRfqKeys();
    const matcher = new PrivateRfqMatcher({
      oraclePrice: () => 100n,
      maxOracleDeviationBps: 100n,
      now: () => now,
    });
    const encrypted = encryptOrder(order("order-1", "sell", "100"), matcher.matcherPublicKey);
    const altered = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext[0] === "A" ? "B" : "A"}${encrypted.ciphertext.slice(1)}`,
    };
    expect(() => matcher.submit(altered, participant.publicKey)).toThrow(/authentication/);
    matcher.submit(encrypted, participant.publicKey);
    expect(() => matcher.submit(encrypted, participant.publicKey)).toThrow(/replay/);
  });

  it("refuses orders beyond the oracle deviation guard", () => {
    const participant = createRfqKeys();
    const matcher = new PrivateRfqMatcher({
      oraclePrice: () => 100n,
      maxOracleDeviationBps: 100n,
      now: () => now,
    });
    expect(() =>
      matcher.submit(
        encryptOrder(order("far", "buy", "150"), matcher.matcherPublicKey),
        participant.publicKey,
      ),
    ).toThrow(/deviation/);
  });
});
