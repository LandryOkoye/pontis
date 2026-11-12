import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SimulatedIntentsClient } from "@pontis/intents-private";
import { errorHandler, notFoundHandler } from "../src/errors.ts";
import { registerIntentsRoutes } from "../src/routes/intents.ts";

let app: ReturnType<typeof Fastify>;
beforeEach(() => {
  app = Fastify();
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerIntentsRoutes(
    app,
    new SimulatedIntentsClient([
      { assetId: "near:test", symbol: "TST", decimals: 6, blockchain: "near", simulated: true },
    ]),
  );
});
afterEach(async () => app.close());

const body = {
  swapType: "EXACT_INPUT",
  slippageTolerance: 100,
  originAsset: "near:test",
  destinationAsset: "evm:test",
  amount: "1000",
  depositType: "ORIGIN_CHAIN",
  recipient: "recipient",
  recipientType: "DESTINATION_CHAIN",
  refundTo: "refund",
  refundType: "ORIGIN_CHAIN",
  deadline: "2030-01-01T00:00:00Z",
};

describe("NEAR Intents API routes", () => {
  it("serves simulated supported assets with honesty labels", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/intents/tokens" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      simulated: true,
      assets: [{ symbol: "TST", simulated: true }],
    });
  });

  it("returns a dry quote without a deposit address", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/intents/quote", payload: body });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      quoteId: "sim-intent-1",
      simulated: true,
      amountOut: "990",
    });
    expect(response.json()).not.toHaveProperty("depositAddress");
  });

  it("creates a simulated deposit route and reports status", async () => {
    const swap = await app.inject({ method: "POST", url: "/v1/intents/swaps", payload: body });
    const depositAddress = swap.json().depositAddress as string;
    expect(depositAddress).toMatch(/^sim-deposit-/);
    const status = await app.inject({
      method: "GET",
      url: `/v1/intents/status?depositAddress=${depositAddress}`,
    });
    expect(status.json()).toMatchObject({ status: "PENDING_DEPOSIT", simulated: true });
  });

  it("rejects malformed or extra quote fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/intents/quote",
      payload: { ...body, unexpected: true },
    });
    expect(response.statusCode).toBe(400);
  });
});
