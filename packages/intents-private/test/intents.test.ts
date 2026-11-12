import { describe, expect, it, vi } from "vitest";
import { OneClickIntentsClient, SimulatedIntentsClient } from "../src/intents.ts";

const request = {
  dry: true as const,
  swapType: "EXACT_INPUT" as const,
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

describe("Intents clients", () => {
  it("returns deterministic, labelled offline quotes", async () => {
    const client = new SimulatedIntentsClient();
    await expect(client.getQuote(request)).resolves.toMatchObject({
      quoteId: "sim-intent-1",
      amountOut: "990",
      simulated: true,
    });
  });

  it("refuses live construction without explicit opt-in and credentials", () => {
    expect(() => new OneClickIntentsClient({ apiKey: "", allowMainnetCalls: true })).toThrow(
      /API key/,
    );
  });

  it("uses the documented production endpoint and API key when opted in", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          quoteId: "q1",
          amountIn: "1000",
          amountOut: "990",
          minAmountOut: "980",
          deadline: request.deadline,
        }),
        { status: 200 },
      ),
    );
    const client = new OneClickIntentsClient({
      apiKey: "test-key",
      allowMainnetCalls: true,
      fetcher,
    });
    await expect(client.getQuote(request)).resolves.toMatchObject({
      quoteId: "q1",
      simulated: false,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://1click.chaindefuser.com/v0/quote");
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get("X-API-Key")).toBe("test-key");
  });
});
