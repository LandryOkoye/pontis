export type IntentAsset = {
  assetId: string;
  symbol: string;
  decimals: number;
  blockchain: string;
  simulated: boolean;
};

export type IntentQuoteRequest = {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  depositType: string;
  recipient: string;
  recipientType: string;
  refundTo: string;
  refundType: string;
  deadline: string;
  confidentiality?: "basic" | "advanced";
};

export type IntentQuote = {
  quoteId: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  depositAddress?: string;
  deadline: string;
  source: "near_intents_1click" | "simulated_intents";
  simulated: boolean;
  confidentiality: "public" | "basic" | "advanced";
};

export type IntentStatus = {
  status: string;
  updatedAt?: string;
  source: IntentQuote["source"];
  simulated: boolean;
};

export interface IntentsClient {
  readonly source: IntentQuote["source"];
  readonly simulated: boolean;
  supportedAssets(): Promise<IntentAsset[]>;
  getQuote(request: IntentQuoteRequest & { dry: true }): Promise<IntentQuote>;
  createSwap(request: IntentQuoteRequest & { dry: false }): Promise<IntentQuote>;
  getStatus(depositAddress: string, depositMemo?: string): Promise<IntentStatus>;
}
