import type {
  IntentAsset,
  IntentQuote,
  IntentQuoteRequest,
  IntentStatus,
  IntentsClient,
} from "./intents-types.ts";

type OneClickOptions = {
  apiKey: string;
  /** Explicit acknowledgement that requests go to production; no testnet exists. */
  allowMainnetCalls: true;
  fetcher?: typeof fetch;
};
type OneClickResponse = Record<string, unknown>;

/** Production 1Click adapter. It creates deposit routes but never submits deposits. */
export class OneClickIntentsClient implements IntentsClient {
  readonly source = "near_intents_1click" as const;
  readonly simulated = false;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OneClickOptions) {
    if (!options.apiKey.trim()) throw new Error("A 1Click partner API key is required");
    if (options.allowMainnetCalls !== true)
      throw new Error("Production calls require explicit opt-in");
    this.fetcher = options.fetcher ?? fetch;
  }

  async supportedAssets(): Promise<IntentAsset[]> {
    const payload = await this.request("/tokens", { method: "GET" });
    const rows = Array.isArray(payload) ? payload : this.object(payload).tokens;
    if (!Array.isArray(rows)) throw new Error("Unexpected 1Click token response");
    return rows.map((value: unknown) => {
      const row = this.object(value);
      const assetId = this.requiredString(row.assetId, "assetId");
      return {
        assetId,
        symbol: typeof row.symbol === "string" ? row.symbol : assetId,
        decimals: typeof row.decimals === "number" ? row.decimals : 0,
        blockchain: typeof row.blockchain === "string" ? row.blockchain : "unknown",
        simulated: false,
      };
    });
  }

  async getQuote(request: IntentQuoteRequest & { dry: true }): Promise<IntentQuote> {
    return this.quote(request);
  }

  async createSwap(request: IntentQuoteRequest & { dry: false }): Promise<IntentQuote> {
    // 1Click's non-dry quote creates a deposit route. It does not transfer funds.
    return this.quote(request);
  }

  async getStatus(depositAddress: string, depositMemo?: string): Promise<IntentStatus> {
    const query = new URLSearchParams({ depositAddress });
    if (depositMemo) query.set("depositMemo", depositMemo);
    const response = this.object(await this.request(`/status?${query}`, { method: "GET" }));
    return {
      status: this.requiredString(response.status, "status"),
      ...(typeof response.updatedAt === "string" ? { updatedAt: response.updatedAt } : {}),
      source: "near_intents_1click",
      simulated: false,
    };
  }

  private async quote(request: IntentQuoteRequest): Promise<IntentQuote> {
    const response = this.object(
      await this.request("/quote", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
    const quote = response.quote === undefined ? response : this.object(response.quote);
    return {
      quoteId: this.requiredString(quote.quoteId ?? quote.id, "quoteId"),
      amountIn: this.requiredString(quote.amountIn ?? quote.amount, "amountIn"),
      amountOut: this.requiredString(quote.amountOut, "amountOut"),
      minAmountOut: this.requiredString(quote.minAmountOut, "minAmountOut"),
      ...(typeof quote.depositAddress === "string" ? { depositAddress: quote.depositAddress } : {}),
      deadline: this.requiredString(quote.deadline, "deadline"),
      source: "near_intents_1click",
      simulated: false,
      confidentiality: request.confidentiality ?? "public",
    };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    headers.set("X-API-Key", this.options.apiKey);
    const response = await this.fetcher(`https://1click.chaindefuser.com/v0${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw new Error(`1Click request failed with HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  private object(value: unknown): OneClickResponse {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Unexpected 1Click response object");
    }
    return value as OneClickResponse;
  }

  private requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Unexpected 1Click response: missing ${name}`);
    }
    return value;
  }
}
