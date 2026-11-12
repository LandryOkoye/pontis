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

  it("refuses live construction without explicit opt-in", () => {
    expect(() => new OneClickIntentsClient({ allowMainnetCalls: false } as never)).toThrow(
      /explicit opt-in/,
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

  it("sends no authentication header when no partner JWT is configured", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          quoteId: "q-unauthenticated",
          amountIn: "1000",
          amountOut: "990",
          minAmountOut: "980",
          deadline: request.deadline,
        }),
        { status: 200 },
      ),
    );
    const client = new OneClickIntentsClient({ allowMainnetCalls: true, fetcher });
    await client.getQuote(request);
    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.has("X-API-Key")).toBe(false);
  });

  it("maps a real-shaped dry response using its correlation ID and request deadline", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          quote: { amountIn: "10000000", amountOut: "9992680", minAmountOut: "9892753" },
          quoteRequest: { deadline: request.deadline },
          correlationId: "fa9fa9f9-a410-4076-a4e6-d307177cae28",
        }),
        { status: 200 },
      ),
    );
    const client = new OneClickIntentsClient({ allowMainnetCalls: true, fetcher });
    await expect(client.getQuote(request)).resolves.toMatchObject({
      quoteId: "fa9fa9f9-a410-4076-a4e6-d307177cae28",
      amountIn: "10000000",
      amountOut: "9992680",
      minAmountOut: "9892753",
      deadline: request.deadline,
      source: "near_intents_1click",
      simulated: false,
    });
  });

  it("requires a deposit address from a non-dry quote without submitting funds", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          quoteId: "q2",
          amountIn: "1000",
          amountOut: "990",
          minAmountOut: "980",
          deadline: request.deadline,
          depositAddress: "near-deposit",
        }),
        { status: 200 },
      ),
    );
    const client = new OneClickIntentsClient({
      apiKey: "test-key",
      allowMainnetCalls: true,
      fetcher,
    });
    await expect(client.createSwap({ ...request, dry: false })).resolves.toMatchObject({
      depositAddress: "near-deposit",
      simulated: false,
    });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { dry: boolean };
    expect(body.dry).toBe(false);
  });

  it("passes deposit memo to the status endpoint", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: "SUCCESS" }), { status: 200 }));
    const client = new OneClickIntentsClient({
      apiKey: "test-key",
      allowMainnetCalls: true,
      fetcher,
    });
    await expect(client.getStatus("deposit-address", "memo-1")).resolves.toMatchObject({
      status: "SUCCESS",
      simulated: false,
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("depositMemo=memo-1");
  });

  it("maps supported assets from a live response without freezing the token list", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { assetId: "chain:asset", symbol: "LIVE", decimals: 8, blockchain: "chain" },
          ]),
          { status: 200 },
        ),
      );
    const client = new OneClickIntentsClient({
      apiKey: "test-key",
      allowMainnetCalls: true,
      fetcher,
    });
    await expect(client.supportedAssets()).resolves.toEqual([
      {
        assetId: "chain:asset",
        symbol: "LIVE",
        decimals: 8,
        blockchain: "chain",
        simulated: false,
      },
    ]);
  });

  it("surfaces non-success HTTP status without returning upstream response bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret upstream detail", { status: 429 }));
    const client = new OneClickIntentsClient({
      apiKey: "test-key",
      allowMainnetCalls: true,
      fetcher,
    });
    await expect(client.getQuote(request)).rejects.toThrow("HTTP 429");
    await expect(client.getQuote(request)).rejects.not.toThrow("secret upstream detail");
  });
});
