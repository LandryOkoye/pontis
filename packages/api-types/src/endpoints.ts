// The MVP endpoint table (BuildPlan §8). This is the single source for both the generated
// `openapi.yaml` and the typed `ENDPOINTS` map that clients and mocks use.
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { ErrorCodeSchema } from "./common.ts";
import { ApiErrorSchema } from "./common.ts";
import { AdminAuthHeaderSchema, ReconciliationReportSchema } from "./admin-types.ts";
import {
  AssetSchema,
  CompatibilitySchema,
  HealthSchema,
  IssuerSchema,
  IssuerSummarySchema,
  LivenessSchema,
} from "./registry-types.ts";
import {
  CompareRoutesRequestSchema,
  CompareRoutesResponseSchema,
  CreateConversionRequestSchema,
  CreateConversionResponseSchema,
  CreateQuoteRequestSchema,
  IdempotencyKeyHeaderSchema,
  ListTransactionsQuerySchema,
  QuoteSchema,
  SubmittedRequestSchema,
  TransactionSchema,
} from "./trading-types.ts";
import { AssetListSchema, ListAssetsQuerySchema } from "./market-types.ts";
import {
  ChartQuerySchema,
  NavChartSchema,
  PriceChartSchema,
  SupplyChartSchema,
  VolumeChartSchema,
} from "./chart-types.ts";
import {
  ActivityListSchema,
  ActivityQuerySchema,
  AssetChainListSchema,
  AssetDocumentListSchema,
  AssetIssuerViewSchema,
  AssetMetadataSchema,
} from "./detail-types.ts";
import {
  CategoryListSchema,
  ChainListSchema,
  MarketMoversSchema,
  MarketOverviewSchema,
  MoversQuerySchema,
  OverviewQuerySchema,
} from "./overview-types.ts";

export const IssuerListSchema = z
  .object({ items: z.array(IssuerSummarySchema) })
  .meta({ id: "IssuerList" });
export const CompatibilityListSchema = z
  .object({ items: z.array(CompatibilitySchema) })
  .meta({ id: "CompatibilityList" });
export const TransactionListSchema = z
  .object({ items: z.array(TransactionSchema) })
  .meta({ id: "TransactionList" });

const IdParam = z.object({ id: z.string() });
const UuidParam = z.object({ id: z.uuid() });

type Method = "get" | "post";

interface Endpoint {
  readonly method: Method;
  readonly path: string;
  readonly summary: string;
  readonly tag:
    | "Health"
    | "Registry"
    | "Market"
    | "Charts"
    | "Routes"
    | "Quotes"
    | "Conversions"
    | "Transactions"
    | "Admin";
  readonly status: number;
  readonly response: z.ZodType;
  /** Error codes this endpoint can return, with their HTTP status. */
  readonly errors: Readonly<Record<number, readonly z.infer<typeof ErrorCodeSchema>[]>>;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly headers?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly description?: string;
  /** Non-error-envelope responses for failure statuses, such as the readiness probe's 503. */
  readonly failureResponses?: Readonly<
    Record<number, { readonly description: string; readonly schema: z.ZodType }>
  >;
}

const VALIDATION = { 400: ["VALIDATION_ERROR"] } as const;
const COMMON = { 429: ["RATE_LIMITED"], 500: ["INTERNAL"] } as const;

/** Keyed by operation ID. */
export const ENDPOINTS = {
  getHealth: {
    method: "get",
    path: "/v1/health",
    summary: "Combined service health",
    tag: "Health",
    status: 200,
    response: HealthSchema,
    errors: { ...COMMON },
    description:
      "Always 200 while the process can answer; the body carries the verdict. `status` is `ok` only when the database and RPC answer and the indexer state is `running`; otherwise `degraded`. Use `/v1/health/ready` for a probe that fails on non-readiness.",
  },
  getHealthLive: {
    method: "get",
    path: "/v1/health/live",
    summary: "Liveness",
    tag: "Health",
    status: 200,
    response: LivenessSchema,
    errors: { ...COMMON },
    description:
      "Answers 200 whenever the process is up. Touches no database, RPC or indexer state, so it is safe for restart probes.",
  },
  getHealthReady: {
    method: "get",
    path: "/v1/health/ready",
    summary: "Readiness",
    tag: "Health",
    status: 200,
    response: HealthSchema,
    errors: { ...COMMON },
    failureResponses: {
      503: {
        description:
          "Not ready: the database or RPC is unreachable, or the indexer never ran or is stale. Same body as `/v1/health`.",
        schema: HealthSchema,
      },
    },
    description:
      "200 when the database and RPC answer and the indexer is `running` or `lagging`; 503 otherwise. A lagging indexer is still ready, but `status` in the body is `degraded`.",
  },
  listIssuers: {
    method: "get",
    path: "/v1/issuers",
    summary: "List issuers",
    tag: "Registry",
    status: 200,
    response: IssuerListSchema,
    errors: { ...COMMON },
  },
  getIssuer: {
    method: "get",
    path: "/v1/issuers/{id}",
    summary: "Issuer detail with evidence",
    tag: "Registry",
    status: 200,
    response: IssuerSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
  },
  listAssets: {
    method: "get",
    path: "/v1/assets",
    summary: "Asset directory: search, filter, sort, paginate",
    tag: "Market",
    status: 200,
    response: AssetListSchema,
    query: ListAssetsQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "One row per representation with its canonical claim name, issuer summary, filter facts, latest market figures and a 7 day sparkline. `market` is null when the asset has no price. Every market figure carries `simulated` and `sources`; `data` selects real rows, simulated rows, or real where they exist (`all`). Sorting by a figure that is null for some assets puts those last. Cursors are opaque and valid only for the same query.",
  },
  getAssetPriceChart: {
    method: "get",
    path: "/v1/assets/{id}/charts/price",
    summary: "OHLCV candles",
    tag: "Charts",
    status: 200,
    response: PriceChartSchema,
    params: IdParam,
    query: ChartQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Candles in `[from, to)`, ascending. `from` defaults to a window of at most 500 buckets before `to`, `to` to now; a range of more than 5000 buckets is refused. A bucket without an observation repeats the previous close and has `filled: true`. Volume of parity conversions is units moved, not a market measure.",
  },
  getAssetNavChart: {
    method: "get",
    path: "/v1/assets/{id}/charts/nav",
    summary: "NAV per token",
    tag: "Charts",
    status: 200,
    response: NavChartSchema,
    params: IdParam,
    query: ChartQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "The last NAV before the end of each bucket, carried forward; `filled: true` when the bucket has no print of its own. Buckets before the first print are omitted, so an asset without a NAV has empty `points`. For `data=all` the real series is used when one exists, otherwise the simulated one.",
  },
  getAssetSupplyChart: {
    method: "get",
    path: "/v1/assets/{id}/charts/supply",
    summary: "Circulating supply",
    tag: "Charts",
    status: 200,
    response: SupplyChartSchema,
    params: IdParam,
    query: ChartQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Supply summed over chains: the last snapshot before the end of each bucket, carried forward, `filled: true` when the bucket has none of its own. Smallest units. Series selection for `data=all` is as for NAV.",
  },
  getAssetVolumeChart: {
    method: "get",
    path: "/v1/assets/{id}/charts/volume",
    summary: "Traded volume",
    tag: "Charts",
    status: 200,
    response: VolumeChartSchema,
    params: IdParam,
    query: ChartQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
  },
  getMarketOverview: {
    method: "get",
    path: "/v1/market/overview",
    summary: "Global market stats",
    tag: "Market",
    status: 200,
    response: MarketOverviewSchema,
    query: OverviewQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "Counts and totals over every asset. Totals include only assets that have the figure (an asset with no known supply has no market cap and is left out of `totalMarketCap`, not counted as zero). `change24hBps` is the market-cap-weighted mean of the assets' 24h changes. `simulated` is true when any included figure is simulated.",
  },
  getMarketMovers: {
    method: "get",
    path: "/v1/market/movers",
    summary: "Gainers, losers, top volume, top TVL, newly listed",
    tag: "Market",
    status: 200,
    response: MarketMoversSchema,
    query: MoversQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "Each list has at most `limit` entries and only includes assets with the relevant figure. Gainers have a positive 24h change and losers a negative one.",
  },
  getMarketCategories: {
    method: "get",
    path: "/v1/market/categories",
    summary: "Breakdown by category",
    tag: "Market",
    status: 200,
    response: CategoryListSchema,
    query: OverviewQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
  },
  getMarketChains: {
    method: "get",
    path: "/v1/market/chains",
    summary: "Breakdown by chain",
    tag: "Market",
    status: 200,
    response: ChainListSchema,
    query: OverviewQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "Supply per chain valued at each asset's price. Only the NEAR testnet has real supply today; other chains appear when assets have profile entries or supply snapshots there.",
  },
  getAsset: {
    method: "get",
    path: "/v1/assets/{id}",
    summary: "Asset representation detail",
    tag: "Registry",
    status: 200,
    response: AssetSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
  },
  getAssetCompatibility: {
    method: "get",
    path: "/v1/assets/{id}/compatibility",
    summary: "Compatibility relationships of an asset",
    tag: "Registry",
    status: 200,
    response: CompatibilityListSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
  },
  getAssetMetadata: {
    method: "get",
    path: "/v1/assets/{id}/metadata",
    summary: "Dossier metadata (overview, legal, custody, risk)",
    tag: "Registry",
    status: 200,
    response: AssetMetadataSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Off-chain dossier content, labelled with `source` and `simulated`. It never changes a verification status; `profile` is null when no dossier was loaded.",
  },
  getAssetIssuer: {
    method: "get",
    path: "/v1/assets/{id}/issuer",
    summary: "The asset's issuer with its evidence and its other assets",
    tag: "Registry",
    status: 200,
    response: AssetIssuerViewSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
  },
  getAssetChains: {
    method: "get",
    path: "/v1/assets/{id}/chains",
    summary: "Where the asset exists, with supply per chain",
    tag: "Registry",
    status: 200,
    response: AssetChainListSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "The dossier's chain list plus the NEAR contract from the registry, each with the latest supply snapshot when one exists.",
  },
  getAssetDocuments: {
    method: "get",
    path: "/v1/assets/{id}/documents",
    summary: "Dossier documents and registry evidence",
    tag: "Registry",
    status: 200,
    response: AssetDocumentListSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Registry evidence keeps its provenance label; the API never upgrades it. Hashes are as recorded, not re-checked here.",
  },
  getAssetActivity: {
    method: "get",
    path: "/v1/assets/{id}/activity",
    summary: "Recent conversions involving the asset",
    tag: "Market",
    status: 200,
    response: ActivityListSchema,
    params: IdParam,
    query: ActivityQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Newest first. Real rows are settled conversions on the testnet; simulated rows come from the demo simulator and say so. Cursors are opaque.",
  },
  compareRoutes: {
    method: "post",
    path: "/v1/routes/compare",
    summary: "Compare routes between two assets",
    tag: "Routes",
    status: 200,
    response: CompareRoutesResponseSchema,
    body: CompareRoutesRequestSchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Always returns 200 with `executable: false` and a `reasonCode` when the pair cannot be converted.",
  },
  createQuote: {
    method: "post",
    path: "/v1/quotes",
    summary: "Request a parity-conversion quote",
    tag: "Quotes",
    status: 201,
    response: QuoteSchema,
    body: CreateQuoteRequestSchema,
    errors: {
      ...VALIDATION,
      404: ["NOT_FOUND"],
      422: [
        "NOT_DIRECT_EQUIVALENT",
        "RELATIONSHIP_SUSPENDED",
        "ASSET_PAUSED",
        "NOT_ELIGIBLE",
        "INSUFFICIENT_INVENTORY",
      ],
      ...COMMON,
    },
    description:
      "Refusals are `422` with a structured error whose `code` is the reason. Quotes expire after 60 seconds.",
  },
  getQuote: {
    method: "get",
    path: "/v1/quotes/{id}",
    summary: "Quote and its state",
    tag: "Quotes",
    status: 200,
    response: QuoteSchema,
    params: UuidParam,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
  },
  createConversion: {
    method: "post",
    path: "/v1/conversions",
    summary: "Accept a quote and get the unsigned wallet actions",
    tag: "Conversions",
    status: 201,
    response: CreateConversionResponseSchema,
    headers: IdempotencyKeyHeaderSchema,
    body: CreateConversionRequestSchema,
    errors: {
      ...VALIDATION,
      404: ["NOT_FOUND"],
      409: ["QUOTE_ALREADY_USED"],
      410: ["QUOTE_EXPIRED"],
      ...COMMON,
    },
    description:
      "Marks the quote `ACCEPTED`. The backend never signs for users: the returned actions are signed by the user's wallet.",
  },
  markConversionSubmitted: {
    method: "post",
    path: "/v1/conversions/{id}/submitted",
    summary: "Report the submitted transaction hash",
    tag: "Conversions",
    status: 200,
    response: TransactionSchema,
    params: UuidParam,
    body: SubmittedRequestSchema,
    errors: {
      ...VALIDATION,
      404: ["NOT_FOUND"],
      409: ["QUOTE_ALREADY_USED"],
      410: ["QUOTE_EXPIRED"],
      422: ["VALIDATION_ERROR"],
      ...COMMON,
    },
    description:
      "Moves the quote to `SUBMITTED`. The hash is checked against the chain: a transaction that exists but is not this conversion's (other signer, receiver, method, amount or quote nonce) is refused with `422` and nothing is stored. A hash the node does not know yet, or an unreachable node, is stored as `reportedTxHash` with `txHashStatus` `REPORTED`; `txHash` stays null until the transaction is verified. Repeating a reported hash re-checks it; a different hash is a conflict.",
  },
  getTransaction: {
    method: "get",
    path: "/v1/transactions/{id}",
    summary: "Conversion with quote, events and state",
    tag: "Transactions",
    status: 200,
    response: TransactionSchema,
    params: UuidParam,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
  },
  listTransactions: {
    method: "get",
    path: "/v1/transactions",
    summary: "Transaction history for an account",
    tag: "Transactions",
    status: 200,
    response: TransactionListSchema,
    query: ListTransactionsQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
  },
  getReconciliation: {
    method: "get",
    path: "/v1/admin/reconciliation",
    summary: "Latest reconciliation findings",
    tag: "Admin",
    status: 200,
    response: ReconciliationReportSchema,
    headers: AdminAuthHeaderSchema,
    errors: { 401: ["UNAUTHORIZED"], ...COMMON },
    description:
      "Admin only. Findings from the reconciler's last run (vault inventory against token balances, stuck and mismatched conversions) and the quotes currently in `REQUIRES_RECONCILIATION`.",
  },
} as const satisfies Record<string, Endpoint>;

export type OperationId = keyof typeof ENDPOINTS;

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Invalid request",
  401: "Missing or wrong admin key",
  404: "Not found",
  409: "Conflict",
  410: "Gone",
  422: "Request understood but refused",
  429: "Rate limited",
  500: "Internal error",
};

export function buildRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  for (const [operationId, e] of Object.entries(ENDPOINTS) as [OperationId, Endpoint][]) {
    const errorResponses = Object.fromEntries(
      Object.entries(e.errors).map(([status, codes]) => [
        status,
        {
          description: `${ERROR_DESCRIPTIONS[Number(status)] ?? "Error"}. Codes: ${codes.join(", ")}.`,
          content: { "application/json": { schema: ApiErrorSchema } },
        },
      ]),
    );
    registry.registerPath({
      method: e.method,
      path: e.path,
      operationId,
      summary: e.summary,
      ...(e.description ? { description: e.description } : {}),
      tags: [e.tag],
      request: {
        ...(e.params ? { params: e.params } : {}),
        ...(e.query ? { query: e.query } : {}),
        ...(e.headers ? { headers: e.headers } : {}),
        ...(e.body
          ? { body: { required: true, content: { "application/json": { schema: e.body } } } }
          : {}),
      },
      responses: {
        [e.status]: {
          description: "Success",
          content: { "application/json": { schema: e.response } },
        },
        ...Object.fromEntries(
          Object.entries(e.failureResponses ?? {}).map(([status, r]) => [
            status,
            { description: r.description, content: { "application/json": { schema: r.schema } } },
          ]),
        ),
        ...errorResponses,
      },
    });
  }
  return registry;
}

export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV31["generateDocument"]> {
  const registry = buildRegistry();
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Pontis API",
      version: "0.1.0",
      description:
        "Pontis MVP API. Testnet and synthetic assets only. All amounts are decimal strings of smallest units; all timestamps are ISO-8601 UTC. Conversions are parity conversions of synthetic test assets, not bridges or exchanges.",
    },
    servers: [{ url: "http://localhost:3000", description: "Local development" }],
  });
}
