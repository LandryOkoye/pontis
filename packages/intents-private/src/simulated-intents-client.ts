import type {
  IntentAsset,
  IntentQuote,
  IntentQuoteRequest,
  IntentStatus,
  IntentsClient,
} from "./intents-types.ts";

export class SimulatedIntentsClient implements IntentsClient {
  readonly source = "simulated_intents" as const;
  readonly simulated = true;
  private sequence = 0;

  constructor(private readonly assets: IntentAsset[] = []) {}

  async supportedAssets(): Promise<IntentAsset[]> {
    return this.assets.map((asset) => ({ ...asset, simulated: true }));
  }

  async getQuote(request: IntentQuoteRequest & { dry: true }): Promise<IntentQuote> {
    return this.makeQuote(request);
  }

  async createSwap(request: IntentQuoteRequest & { dry: false }): Promise<IntentQuote> {
    return this.makeQuote(request);
  }

  async getStatus(depositAddress: string, _depositMemo?: string): Promise<IntentStatus> {
    return {
      status: depositAddress.startsWith("sim-") ? "PENDING_DEPOSIT" : "UNKNOWN",
      source: "simulated_intents",
      simulated: true,
    };
  }

  private makeQuote(request: IntentQuoteRequest): IntentQuote {
    this.sequence += 1;
    const amountOut = (BigInt(request.amount) * 99n) / 100n;
    return {
      quoteId: `sim-intent-${this.sequence}`,
      amountIn: request.amount,
      amountOut: amountOut.toString(),
      minAmountOut: amountOut.toString(),
      ...(!request.dry ? { depositAddress: `sim-deposit-${this.sequence}` } : {}),
      deadline: request.deadline,
      source: "simulated_intents",
      simulated: true,
      confidentiality: request.confidentiality ?? "public",
    };
  }
}
