// Typed client for the Pontis API (BuildPlan §8). Types come from `@pontis/api-types` as
// type-only imports, so none of its Zod/OpenAPI runtime reaches the browser bundle.
import type {
  ApiError,
  Asset,
  AssetSummary,
  Compatibility,
  CompareRoutesRequest,
  CompareRoutesResponse,
  CreateConversionResponse,
  CreateQuoteRequest,
  Health,
  Issuer,
  IssuerSummary,
  Quote,
  ReconciliationReport,
  Transaction,
} from "@pontis/api-types";
import { config } from "./config.ts";
import type {
  BorrowingCapacity,
  CollateralAsset,
  Eligibility,
  EligibilityRequest,
  LendingMarket,
  LendingOperation,
  LendingPlan,
  PlanRequest,
  WalletCollateral,
} from "./lending-types.ts";
import type { ChartRange, MarketChart, MarketDetail, MarketRow } from "./market-types.ts";

export interface IntentAsset {
  assetId: string;
  symbol: string;
  decimals: number;
  blockchain: string;
  simulated: boolean;
}

export interface IntentQuote {
  quoteId: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  deadline: string;
  source: "near_intents_1click" | "simulated_intents";
  simulated: boolean;
}

export interface IntentTokensResponse {
  assets: IntentAsset[];
  source: "near_intents_1click" | "simulated_intents";
  simulated: boolean;
}

type IntentQuoteRequest = {
  swapType: "EXACT_INPUT";
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
};

/** A non-2xx answer from the API, carrying its stable `code`. */
export class ApiFailure extends Error {
  readonly code: ApiError["code"] | "NETWORK";
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;
  constructor(code: ApiFailure["code"], message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = "ApiFailure";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfter;
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiFailure("NETWORK", "The Pontis API could not be reached.", 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload as Partial<ApiError> | null;
    throw new ApiFailure(
      error?.code ?? "INTERNAL",
      error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      error?.retryAfterSeconds,
    );
  }
  return payload as T;
}

interface List<T> {
  items: T[];
}

const LENDING_PLAN_PATH: Record<LendingOperation, string> = {
  deposit: "/v1/lending/deposits",
  borrow: "/v1/lending/borrows",
  repay: "/v1/lending/repayments",
  withdraw: "/v1/lending/withdrawals",
};

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/v1/health", signal ? { signal } : {}),
  intentTokens: () => request<IntentTokensResponse>("/v1/intents/tokens"),
  intentQuote: (body: IntentQuoteRequest) =>
    request<IntentQuote>("/v1/intents/quote", { method: "POST", body }),
  issuers: () => request<List<IssuerSummary>>("/v1/issuers").then((r) => r.items),
  issuer: (id: string) => request<Issuer>(`/v1/issuers/${encodeURIComponent(id)}`),
  assets: () => request<List<AssetSummary>>("/v1/assets").then((r) => r.items),
  asset: (id: string) => request<Asset>(`/v1/assets/${encodeURIComponent(id)}`),
  // Market data: mock-only until the backend ships these endpoints (BACKEND-REQUESTS.md §6).
  marketAssets: () => request<List<MarketRow>>("/v1/market/assets").then((r) => r.items),
  marketAsset: (id: string) => request<MarketDetail>(`/v1/market/assets/${encodeURIComponent(id)}`),
  marketChart: (id: string, range: ChartRange) =>
    request<MarketChart>(`/v1/market/assets/${encodeURIComponent(id)}/chart?range=${range}`),
  compatibility: (id: string) =>
    request<List<Compatibility>>(`/v1/assets/${encodeURIComponent(id)}/compatibility`).then(
      (r) => r.items,
    ),
  compareRoutes: (body: CompareRoutesRequest) =>
    request<CompareRoutesResponse>("/v1/routes/compare", { method: "POST", body }),
  createQuote: (body: CreateQuoteRequest) => request<Quote>("/v1/quotes", { method: "POST", body }),
  quote: (id: string) => request<Quote>(`/v1/quotes/${id}`),
  createConversion: (quoteId: string, idempotencyKey: string) =>
    request<CreateConversionResponse>("/v1/conversions", {
      method: "POST",
      body: { quoteId },
      headers: { "idempotency-key": idempotencyKey },
    }),
  markSubmitted: (conversionId: string, txHash: string) =>
    request<Transaction>(`/v1/conversions/${conversionId}/submitted`, {
      method: "POST",
      body: { txHash },
    }),
  transaction: (id: string) => request<Transaction>(`/v1/transactions/${id}`),
  transactions: (account: string) =>
    request<List<Transaction>>(
      `/v1/transactions?account=${encodeURIComponent(account)}&limit=100`,
    ).then((r) => r.items),
  collateralAssets: () =>
    request<List<CollateralAsset>>("/v1/lending/collateral-assets").then((r) => r.items),
  walletCollateral: (owner: string) =>
    request<List<WalletCollateral>>(
      `/v1/lending/wallet-assets?owner=${encodeURIComponent(owner)}`,
    ).then((r) => r.items),
  lendingMarkets: () => request<List<LendingMarket>>("/v1/lending/markets").then((r) => r.items),
  collateralEligibility: (body: EligibilityRequest) =>
    request<Eligibility>("/v1/lending/eligibility", { method: "POST", body }),
  borrowingCapacity: (marketId: string, owner: string) =>
    request<BorrowingCapacity>(
      `/v1/lending/markets/${encodeURIComponent(marketId)}/capacity?owner=${encodeURIComponent(owner)}`,
    ),
  /** Unsigned calls for the wallet to sign. The API never broadcasts them. */
  lendingPlan: (operation: LendingOperation, body: PlanRequest) =>
    request<LendingPlan>(LENDING_PLAN_PATH[operation], { method: "POST", body }),
  reconciliation: (adminKey: string) =>
    request<ReconciliationReport>("/v1/admin/reconciliation", {
      headers: { authorization: `Bearer ${adminKey}` },
    }),
};
