import Fastify from "fastify";
import {
  createRfqKeys,
  encryptOrder,
  matchCommitment,
  openDisclosure,
  PrivateRfqMatcher,
} from "@pontis/intents-private";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorHandler, notFoundHandler } from "../src/errors.ts";
import { registerPrivateRfqRoutes } from "../src/routes/private-rfq.ts";

let app: ReturnType<typeof Fastify>;
let matcher: PrivateRfqMatcher;
const now = 1_800_000_000_000;

beforeEach(() => {
  app = Fastify();
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  matcher = new PrivateRfqMatcher({
    oraclePrice: (asset) => (asset === "sim:asset-a" ? 100n : undefined),
    maxOracleDeviationBps: 1_000n,
    now: () => now,
  });
  registerPrivateRfqRoutes(app, matcher);
});
afterEach(async () => app.close());

describe("private RFQ API", () => {
  it("matches encrypted institutions and returns participant-encrypted disclosures", async () => {
    const seller = createRfqKeys();
    const buyer = createRfqKeys();
    const sellOrder = {
      id: "sell-1",
      institutionId: "seller",
      assetId: "sim:asset-a",
      side: "sell" as const,
      size: "20",
      limitPrice: "100",
      expiryMs: now + 10_000,
      createdAtMs: now - 1,
    };
    const buyOrder = {
      ...sellOrder,
      id: "buy-1",
      institutionId: "buyer",
      side: "buy" as const,
      limitPrice: "101",
    };
    const key = await app.inject({ method: "GET", url: "/v1/private-rfq/matcher-key" });
    const matcherPublicKey = Buffer.from(key.json().publicKey as string, "base64");
    expect(key.json()).toMatchObject({
      confidentiality_level: "operator_trusted",
      simulated: true,
    });
    await app.inject({
      method: "POST",
      url: "/v1/private-rfq/orders",
      payload: {
        order: encryptOrder(sellOrder, matcherPublicKey),
        disclosurePublicKey: Buffer.from(seller.publicKey).toString("base64"),
      },
    });
    const matched = await app.inject({
      method: "POST",
      url: "/v1/private-rfq/orders",
      payload: {
        order: encryptOrder(buyOrder, matcherPublicKey),
        disclosurePublicKey: Buffer.from(buyer.publicKey).toString("base64"),
      },
    });
    expect(matched.json()).toMatchObject({
      status: "matched",
      confidentiality_level: "operator_trusted",
      simulated: true,
    });
    const instruction = matched.json().settlement;
    const disclosure = await app.inject({
      method: "GET",
      url: `/v1/private-rfq/settlements/${instruction.settlementId}/disclosure?publicKey=${encodeURIComponent(Buffer.from(seller.publicKey).toString("base64"))}`,
    });
    const opened = openDisclosure(disclosure.json().disclosure, seller.secretKey);
    expect(matchCommitment(opened)).toBe(instruction.commitment);
  });

  it("refuses an unsupported simulated asset and unknown disclosures", async () => {
    const participant = createRfqKeys();
    const encrypted = encryptOrder(
      {
        id: "unknown",
        institutionId: "institution",
        assetId: "live:asset",
        side: "buy",
        size: "1",
        limitPrice: "100",
        expiryMs: now + 1_000,
        createdAtMs: now - 1,
      },
      matcher.matcherPublicKey,
    );
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/private-rfq/orders",
      payload: {
        order: encrypted,
        disclosurePublicKey: Buffer.from(participant.publicKey).toString("base64"),
      },
    });
    expect(rejected.statusCode).toBe(400);
    const missing = await app.inject({
      method: "GET",
      url: `/v1/private-rfq/settlements/nope/disclosure?publicKey=${encodeURIComponent(Buffer.from(participant.publicKey).toString("base64"))}`,
    });
    expect(missing.statusCode).toBe(404);
  });
});
