// The MVP endpoint table (BuildPlan §8). This is the single source for both the generated
// `openapi.yaml` and the typed `ENDPOINTS` map that clients and mocks use.
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { ErrorCodeSchema } from "./common.ts";
import { ApiErrorSchema } from "./common.ts";
import {
  IntentQuoteRequestSchema,
  IntentQuoteSchema,
  IntentStatusSchema,
  IntentTokensResponseSchema,
  MatcherKeySchema,
  PrivateRfqDisclosureSchema,
  PrivateRfqEncryptedOrderSchema,
  PrivateRfqSubmissionSchema,
} from "./intents-types.ts";
import { AssetLifecycleSchema, AssetNavSchema, CorporateActionListSchema } from "./action-types.ts";
import { AdminAuthHeaderSchema, ReconciliationReportSchema } from "./admin-types.ts";
import {
  CreateMintRequestSchema,
  FulfilRedemptionRequestSchema,
  IssuerMintRequestsQuerySchema,
  IssuerRedemptionListSchema,
  IssuerRedemptionsQuerySchema,
  MintIntentSchema,
  MintRequestListSchema,
  PrepareRedemptionRequestSchema,
  PrepareRedemptionResponseSchema,
  RedemptionIntentSchema,
  RejectRedemptionRequestSchema,
  ReserveMonitorReportSchema,
} from "./session-types.ts";
import {
  AssetCustodySchema,
  AssetRedemptionTermsSchema,
  AssetReservesSchema,
  CustodianListSchema,
  CustodianSchema,
  CustodyListQuerySchema,
  IssuerReliabilitySchema,
  ListRedemptionsQuerySchema,
  RedemptionListSchema,
  RedemptionSchema,
  ReserveHistorySchema,
  SubmitReserveAttestationRequestSchema,
  SubmitReserveAttestationResponseSchema,
} from "./custody-types.ts";
import {
  AuthChallengeRequestSchema,
  AuthChallengeResponseSchema,
  AuthLogoutResponseSchema,
  AuthMeResponseSchema,
  AuthSessionHeaderSchema,
  AuthVerifyRequestSchema,
  AuthVerifyResponseSchema,
} from "./auth-types.ts";
import { RouteGuardsQuerySchema, RouteGuardsResponseSchema } from "./guard-types.ts";
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
import {
  CompareQuerySchema,
  CompareResponseSchema,
  SearchQuerySchema,
  SearchResultSchema,
} from "./discovery-types.ts";
import {
  AdminMetricsSchema,
  PrometheusTextSchema,
  ProtocolMetricsSchema,
} from "./metrics-types.ts";
import { IssuerLeaderboardSchema, LeaderboardQuerySchema, StatusSchema } from "./status-types.ts";

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
const IntentStatusQuery = z
  .object({ depositAddress: z.string().min(1), depositMemo: z.string().optional() })
  .strict();
const PrivateRfqOrderRequest = z
  .object({
    order: PrivateRfqEncryptedOrderSchema,
    disclosurePublicKey: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
const SettlementParam = z.object({ settlementId: z.string().min(1) });
const DisclosureQuery = z
  .object({ publicKey: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/) })
  .strict();
const RedemptionIdParam = z.object({ id: z.string().regex(/^[0-9]{1,20}$/) });

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
    | "Custody"
    | "Quotes"
    | "Conversions"
    | "Transactions"
    | "Metrics"
    | "Auth"
    | "Issuer"
    | "Admin"
    | "Intents"
    | "Private RFQ";
  readonly status: number;
  readonly response: z.ZodType;
  /** Media type of the success response; JSON unless set. */
  readonly contentType?: string;
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
const SESSION = { 401: ["UNAUTHORIZED"], 403: ["FORBIDDEN"] } as const;
const FORBIDDEN = { 403: ["FORBIDDEN"] } as const;
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
  getIntentTokens: {
    method: "get",
    path: "/v1/intents/tokens",
    summary: "List assets exposed by the configured Intents adapter",
    tag: "Intents",
    status: 200,
    response: IntentTokensResponseSchema,
    errors: { ...COMMON },
    description: "The default adapter is simulated; runtime asset support can change.",
  },
  createIntentQuote: {
    method: "post",
    path: "/v1/intents/quote",
    summary: "Request a dry Intents quote",
    tag: "Intents",
    status: 200,
    response: IntentQuoteSchema,
    body: IntentQuoteRequestSchema,
    errors: { ...VALIDATION, ...COMMON },
  },
  createIntentSwap: {
    method: "post",
    path: "/v1/intents/swaps",
    summary: "Create an Intents deposit route",
    tag: "Intents",
    status: 200,
    response: IntentQuoteSchema,
    body: IntentQuoteRequestSchema,
    errors: { ...VALIDATION, ...COMMON },
    description: "Creates a quote-specific deposit route; Pontis does not submit funds.",
  },
  getIntentStatus: {
    method: "get",
    path: "/v1/intents/status",
    summary: "Read Intents deposit route status",
    tag: "Intents",
    status: 200,
    response: IntentStatusSchema,
    query: IntentStatusQuery,
    errors: { ...VALIDATION, ...COMMON },
  },
  getPrivateRfqMatcherKey: {
    method: "get",
    path: "/v1/private-rfq/matcher-key",
    summary: "Get the local RFQ matcher public key",
    tag: "Private RFQ",
    status: 200,
    response: MatcherKeySchema,
    errors: { ...COMMON },
  },
  submitPrivateRfqOrder: {
    method: "post",
    path: "/v1/private-rfq/orders",
    summary: "Submit an encrypted RFQ order",
    tag: "Private RFQ",
    status: 200,
    response: PrivateRfqSubmissionSchema,
    body: PrivateRfqOrderRequest,
    errors: { ...VALIDATION, ...COMMON },
    description: "The local matcher is operator-trusted and does not submit settlement to core.",
  },
  getPrivateRfqDisclosure: {
    method: "get",
    path: "/v1/private-rfq/settlements/{settlementId}/disclosure",
    summary: "Get an encrypted matched-order disclosure",
    tag: "Private RFQ",
    status: 200,
    response: PrivateRfqDisclosureSchema,
    params: SettlementParam,
    query: DisclosureQuery,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
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
  getAssetLifecycle: {
    method: "get",
    path: "/v1/assets/{id}/lifecycle",
    summary: "Lifecycle kind, stage, flags and stage history",
    tag: "Registry",
    status: 200,
    response: AssetLifecycleSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Read from the chain on every request; like other public reads it may be shared-cached for a few seconds. An asset with no lifecycle record is a `fungible` asset in stage `active`. Anything but `active`, or a conversion flag, closes the asset's routes (`NOT_CONVERTIBLE`, `LIFECYCLE_BLOCKED`). Stage changes are entered by the registrar; delisting needs a second account.",
  },
  getAssetCorporateActions: {
    method: "get",
    path: "/v1/assets/{id}/corporate-actions",
    summary: "Corporate actions of the asset's claim and each wrapper's multiplier schedule",
    tag: "Registry",
    status: 200,
    response: CorporateActionListSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Read from the chain on every request; like other public reads it may be shared-cached for a few seconds. Actions belong to the canonical claim and apply to every wrapper of it: `wrappers` says which have applied. Routes of the claim are closed during an approved action's freeze window (`CORPORATE_ACTION_FREEZE`) and until every live wrapper has applied a multiplier change (`CORPORATE_ACTION_PENDING`). The facts are entered by the registrar; evidence keeps its own provenance label and nothing here is verified.",
  },
  getAssetNav: {
    method: "get",
    path: "/v1/assets/{id}/nav",
    summary: "Current NAV strike and its window",
    tag: "Registry",
    status: 200,
    response: AssetNavSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Read from the chain on every request; like other public reads it may be shared-cached for a few seconds. `strike` is null for an asset that is not a NAV fund and for a fund with no strike yet. A fund converts only while `windowState` is `open`. The demo publishes simulated strikes only: `simulated` and `source` are shown as stored.",
  },
  compareAssets: {
    method: "get",
    path: "/v1/compare",
    summary: "Compare representations side by side",
    tag: "Market",
    status: 200,
    response: CompareResponseSchema,
    query: CompareQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Two to six asset IDs. Each item carries price, NAV and premium to NAV; `pairs` gives, for assets that share a canonical claim, the parity ratio from the registry's unit definitions, the implied market ratio and the deviation between them. All figures are from the data class selected by `data` and say whether they are simulated.",
  },
  search: {
    method: "get",
    path: "/v1/search",
    summary: "Search assets, issuers and chains",
    tag: "Market",
    status: 200,
    response: SearchResultSchema,
    query: SearchQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "All words must match. Assets rank by exact symbol, then symbol prefix, then ID. At most 10 assets, 5 issuers and 5 chains.",
  },
  getIssuerLeaderboard: {
    method: "get",
    path: "/v1/issuers/leaderboard",
    summary: "Issuers ranked by market cap of their assets",
    tag: "Market",
    status: 200,
    response: IssuerLeaderboardSchema,
    query: LeaderboardQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "`reliabilityScore` is null until redemption and reserve data exist; no score is invented. Issuers without a known market cap rank after those with one.",
  },
  getStatus: {
    method: "get",
    path: "/v1/status",
    summary: "Transparency feed: indexer, price and job freshness, route health",
    tag: "Health",
    status: 200,
    response: StatusSchema,
    errors: { ...COMMON },
    description:
      "`reserves` and `bridge` are null until those features exist. `stale` marks a price or job older than its threshold (15 minutes for prices, 5 minutes for the market jobs); simulated prices are reported apart from real ones.",
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
  getRouteGuards: {
    method: "get",
    path: "/v1/routes/{fromId}/{toId}/guards",
    summary: "Why a route is open or closed: every guard and the fee for an amount",
    tag: "Routes",
    status: 200,
    response: RouteGuardsResponseSchema,
    params: z.object({ fromId: z.string(), toId: z.string() }),
    query: RouteGuardsQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Read from the chain, never cached. Checks are independent, so a failure does not hide later ones. With `amount` the amount limits and the effective fee (skew included) are evaluated; a quote copies that fee. `prices` are the contract's stored reference prices with their `simulated` flag: the demo publishes simulated prices only.",
  },
  listCustodians: {
    method: "get",
    path: "/v1/custodians",
    summary: "Registered custodians",
    tag: "Custody",
    status: 200,
    response: CustodianListSchema,
    query: CustodyListQuerySchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "Read from the chain on every request; like other public reads it may be shared-cached for a few seconds. Oldest first. Every custodian in the demo is a simulator holding a test key: `synthetic` is true and `verificationStatus` is never above what the registrar recorded, which the contract keeps below `independently_verified`. Nothing here is custodied, audited or regulated.",
  },
  getCustodian: {
    method: "get",
    path: "/v1/custodians/{id}",
    summary: "One custodian",
    tag: "Custody",
    status: 200,
    response: CustodianSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
  },
  getAssetCustody: {
    method: "get",
    path: "/v1/assets/{id}/custody",
    summary: "How an asset's reserves are held and by whom",
    tag: "Custody",
    status: 200,
    response: AssetCustodySchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Read from the chain. `linked` is false until the registrar links the asset to custodians. This is a record of who is said to hold the reserves, not a proof that anyone does.",
  },
  getAssetReserves: {
    method: "get",
    path: "/v1/assets/{id}/reserves",
    summary: "Reserve status: attested reserves against supply",
    tag: "Custody",
    status: 200,
    response: AssetReservesSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Computed by the contract on every read from the custodians' signed attestations and the supply it tracks; never a stored verdict; like other public reads the response may be shared-cached for a few seconds. `ratioBps` is attested over circulating in basis points (null while nothing circulates); render `ratioPercent`. `state` is `unmonitored` when the asset has no reserve policy. `simulated` and `sources` say whose figures these are: in the demo, a fictional custodian's. Never present them as backed, custodied or audited.",
  },
  getAssetReserveHistory: {
    method: "get",
    path: "/v1/assets/{id}/reserves/history",
    summary: "Reserve attestations, newest first",
    tag: "Custody",
    status: 200,
    response: ReserveHistorySchema,
    params: IdParam,
    query: CustodyListQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "The attestations the chain still holds (the last 500 per asset), each with the label its signer put on it.",
  },
  getAssetRedemptionTerms: {
    method: "get",
    path: "/v1/assets/{id}/redemption-terms",
    summary: "Enforced redemption terms",
    tag: "Custody",
    status: 200,
    response: AssetRedemptionTermsSchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "`terms` is null until the registrar sets them; then the asset cannot be redeemed. The terms hash is part of the redeem message: a request made under older terms is refused. Redemption pays no value: fee and net are figures a simulated issuer honours off-chain.",
  },
  getIssuerReliability: {
    method: "get",
    path: "/v1/issuers/{id}/reliability",
    summary: "An issuer's redemption record",
    tag: "Custody",
    status: 200,
    response: IssuerReliabilitySchema,
    params: IdParam,
    errors: { 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Counters from the contract and a score derived from them here. Every issuer in the demo is a simulator, so `simulated` is true.",
  },
  listRedemptions: {
    method: "get",
    path: "/v1/redemptions",
    summary: "Redemption requests",
    tag: "Custody",
    status: 200,
    response: RedemptionListSchema,
    query: ListRedemptionsQuerySchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Needs `user` or `representationId`. Newest first, read from the chain. `status` filters within a page, so a page may hold fewer than `limit` items while `nextCursor` is set.",
  },
  getRedemption: {
    method: "get",
    path: "/v1/redemptions/{id}",
    summary: "A redemption and its timeline",
    tag: "Custody",
    status: 200,
    response: RedemptionSchema,
    params: RedemptionIdParam,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "The escrow is released by the issuer's fulfilment (burned) or by the user's reclaim after a rejection or expiry. `timeline` is rebuilt from the chain record; `txHash` stays null until the indexer's event mirror supplies it.",
  },
  prepareRedemption: {
    method: "post",
    path: "/v1/redemptions/prepare",
    summary: "Prepare a redemption request (unsigned)",
    tag: "Custody",
    status: 201,
    response: PrepareRedemptionResponseSchema,
    headers: AuthSessionHeaderSchema,
    body: PrepareRedemptionRequestSchema,
    errors: {
      ...VALIDATION,
      401: ["UNAUTHORIZED"],
      404: ["NOT_FOUND"],
      409: [
        "REDEMPTION_WINDOW_CLOSED",
        "REDEMPTION_BELOW_MIN",
        "REDEMPTION_ABOVE_MAX",
        "REDEMPTION_TERMS_CHANGED",
      ],
      422: ["ASSET_PAUSED"],
      ...COMMON,
    },
    description:
      "Session required; the signed-in account is the redeemer. Checks `amount` and the window against the stored terms (read from the chain), stores the client-encrypted payout instruction unread, and returns the `redeem:{termsHash}:{payoutInstructionHash}` message with the unsigned `ft_transfer_call` that escrows the whole amount. The API signs and sends nothing: the wallet signs `actions`. A redemption in this demo pays nothing out; it escrows tokens that the simulated issuer then burns or the user reclaims.",
  },
  reclaimRedemptionIntent: {
    method: "post",
    path: "/v1/redemptions/{id}/reclaim-intent",
    summary: "Unsigned action to reclaim an escrow",
    tag: "Custody",
    status: 200,
    response: RedemptionIntentSchema,
    headers: AuthSessionHeaderSchema,
    params: RedemptionIdParam,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], 409: ["STATE_CONFLICT"], ...COMMON },
    description:
      "Session required, and only the redemption's own account. Refused with `STATE_CONFLICT` unless the escrow is reclaimable now (`rejected`, `expired`, or past its deadline) and no token call is in flight. Returns the unsigned `reclaim_redemption`; the wallet signs it.",
  },
  submitReserveAttestation: {
    method: "post",
    path: "/v1/reserves/attestations",
    summary: "Relay a signed reserve attestation",
    tag: "Custody",
    status: 201,
    response: SubmitReserveAttestationResponseSchema,
    body: SubmitReserveAttestationRequestSchema,
    errors: { ...VALIDATION, 404: ["NOT_FOUND"], 422: ["ATTESTATION_REJECTED"], ...COMMON },
    description:
      "Testnet and sandbox only. A relayer account pays for the transaction; the signature is the authority, so the relayer holds no custodian key and no user key. The contract checks the signature, the custodian's registered key, the link, the time and the sequence, and refuses with `ATTESTATION_REJECTED` otherwise. Unknown asset: `NOT_FOUND`; also `NOT_FOUND` where no relayer is configured.",
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
        "PRICE_DEVIATION",
        "PRICE_STALE",
        "PRICE_UNAVAILABLE",
        "AMOUNT_BELOW_MIN",
        "AMOUNT_ABOVE_MAX",
        "WINDOW_LIMIT_EXCEEDED",
        "CORPORATE_ACTION_FREEZE",
        "CORPORATE_ACTION_PENDING",
        "EPOCH_MISMATCH",
        "NOT_CONVERTIBLE",
        "LIFECYCLE_BLOCKED",
        "NAV_WINDOW_CLOSED",
        "RESERVE_RESTRICTED",
        "RESERVE_STALE",
      ],
      ...COMMON,
    },
    description:
      "Refusals are `422` with a structured error whose `code` is the reason. Quotes expire after 60 seconds, or at the start of the next approved corporate-action freeze window of either claim if that comes sooner.",
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
    errors: { 401: ["UNAUTHORIZED"], ...FORBIDDEN, ...COMMON },
    description:
      "Operators only: a session whose account holds the owner, registrar, compat_approver or pauser role (re-read from the chain on every call), or the break-glass admin key. Findings from the reconciler's last run (vault inventory against token balances, stuck and mismatched conversions) and the quotes currently in `REQUIRES_RECONCILIATION`.",
  },
  listIssuerRedemptions: {
    method: "get",
    path: "/v1/issuer/redemptions",
    summary: "The issuer back-office redemption queue",
    tag: "Issuer",
    status: 200,
    response: IssuerRedemptionListSchema,
    headers: AuthSessionHeaderSchema,
    query: IssuerRedemptionsQuerySchema,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Session required. Lists redemptions of the representations of every issuer whose `controlled_accounts` (read from the chain) hold the signed-in account; an operator role (owner, registrar, compat_approver, pauser) lists every issuer's queue. Never includes payout instructions. `status` filters while scanning the newest 500 requests of each representation, so a page can hold fewer than `limit` items while `nextCursor` is set. The back-office is a labelled mock: the registrar's claim of control is not proof of anything.",
  },
  acceptRedemption: {
    method: "post",
    path: "/v1/issuer/redemptions/{id}/accept",
    summary: "Unsigned action to accept a redemption",
    tag: "Issuer",
    status: 200,
    response: RedemptionIntentSchema,
    headers: AuthSessionHeaderSchema,
    params: RedemptionIdParam,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], 409: ["STATE_CONFLICT"], ...COMMON },
    description:
      "Session required; the account must be one the redemption's issuer controls (read from the chain). `STATE_CONFLICT` unless the request is `requested` and before its accept deadline. Returns the unsigned `accept_redemption`.",
  },
  rejectRedemption: {
    method: "post",
    path: "/v1/issuer/redemptions/{id}/reject",
    summary: "Unsigned action to reject a redemption",
    tag: "Issuer",
    status: 200,
    response: RedemptionIntentSchema,
    headers: AuthSessionHeaderSchema,
    params: RedemptionIdParam,
    body: RejectRedemptionRequestSchema,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], 409: ["STATE_CONFLICT"], ...COMMON },
    description:
      "Like accept, for a request that is `requested` or `accepted` and not past its current deadline. Returns the unsigned `reject_redemption`; the user then reclaims the escrow.",
  },
  fulfilRedemption: {
    method: "post",
    path: "/v1/issuer/redemptions/{id}/fulfil",
    summary: "Unsigned action to fulfil a redemption",
    tag: "Issuer",
    status: 200,
    response: RedemptionIntentSchema,
    headers: AuthSessionHeaderSchema,
    params: RedemptionIdParam,
    body: FulfilRedemptionRequestSchema,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], 409: ["STATE_CONFLICT"], ...COMMON },
    description:
      "Like accept, for a request that is `accepted`, before its fulfil deadline and not mid-settlement. Returns the unsigned `fulfil_redemption`, which burns the escrow. Fulfilment is a simulated record: nothing is paid to anyone.",
  },
  listIssuerMintRequests: {
    method: "get",
    path: "/v1/issuer/mint-requests",
    summary: "The issuer's mint requests",
    tag: "Issuer",
    status: 200,
    response: MintRequestListSchema,
    headers: AuthSessionHeaderSchema,
    query: IssuerMintRequestsQuerySchema,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Same access and scanning rules as the redemption queue. Mint requests are read from the chain.",
  },
  createIssuerMintRequest: {
    method: "post",
    path: "/v1/issuer/mint-requests",
    summary: "Unsigned action to request a gated mint",
    tag: "Issuer",
    status: 200,
    response: MintIntentSchema,
    headers: AuthSessionHeaderSchema,
    body: CreateMintRequestSchema,
    errors: { ...VALIDATION, ...SESSION, 404: ["NOT_FOUND"], ...COMMON },
    description:
      "Session required; the account must be one the asset's issuer controls. Returns the unsigned `request_mint`, which only records the intent: nothing is minted until `execute_mint`, and the contract caps that at the attested headroom.",
  },
  executeIssuerMintRequest: {
    method: "post",
    path: "/v1/issuer/mint-requests/{id}/execute",
    summary: "Unsigned action to execute a mint request",
    tag: "Issuer",
    status: 200,
    response: MintIntentSchema,
    headers: AuthSessionHeaderSchema,
    params: RedemptionIdParam,
    errors: {
      ...VALIDATION,
      ...SESSION,
      404: ["NOT_FOUND"],
      409: ["STATE_CONFLICT"],
      422: ["MINT_REFUSED"],
      ...COMMON,
    },
    description:
      "Like the request, for a mint request that is still `requested`. `MINT_REFUSED` when the chain would refuse now: above the attested reserve headroom, paused by the reserve action, or no reserve policy. Returns the unsigned `execute_mint`.",
  },
  getReserveMonitor: {
    method: "get",
    path: "/v1/admin/reserve-monitor",
    summary: "The reserve monitor's latest pass",
    tag: "Admin",
    status: 200,
    response: ReserveMonitorReportSchema,
    headers: AdminAuthHeaderSchema,
    errors: { 401: ["UNAUTHORIZED"], ...FORBIDDEN, ...COMMON },
    description:
      "Operators only, like the reconciliation read. What the indexer's monitor saw of each monitored representation in its last pass (breaches, stale reserves, failed reads) and whether it could sign the permissionless `refresh_supply` and `evaluate_reserve` calls. Labelled simulated: the reserves are signed claims of fictional custodians.",
  },
  getProtocolMetrics: {
    method: "get",
    path: "/v1/metrics/protocol",
    summary: "Protocol success metrics",
    tag: "Metrics",
    status: 200,
    response: ProtocolMetricsSchema,
    errors: { ...COMMON },
    description:
      "Public aggregates for the windows `24h`, `7d` and `all`, rolling from `asOf`. No account IDs, quote IDs or per-representation amounts. Metrics that need later-phase data are listed with `available: false` and `availableFrom`. Cached for 30 seconds.",
  },
  getAdminMetrics: {
    method: "get",
    path: "/v1/admin/metrics",
    summary: "Protocol success metrics, admin view",
    tag: "Admin",
    status: 200,
    response: AdminMetricsSchema,
    headers: AdminAuthHeaderSchema,
    errors: { 401: ["UNAUTHORIZED"], ...FORBIDDEN, ...COMMON },
    description:
      "Operators only (any of owner, registrar, compat_approver, pauser; roles cached for 60 seconds), or the break-glass admin key; audited like the reconciliation read, never cached. Everything in the public response plus operational aggregates, per-representation amounts (volume, fees, vault inventory) and the IDs of quotes in `REQUIRES_RECONCILIATION`.",
  },
  getPrometheusMetrics: {
    method: "get",
    path: "/metrics",
    summary: "Prometheus exposition of the metrics",
    tag: "Admin",
    status: 200,
    response: PrometheusTextSchema,
    contentType: "text/plain; version=0.0.4",
    headers: AdminAuthHeaderSchema,
    errors: { 401: ["UNAUTHORIZED"], ...FORBIDDEN, ...COMMON },
    description:
      "Operators only. Carries the same numbers as the admin view, including per-representation amounts, so it takes the same credentials (for a scraper use the break-glass admin bearer key; a session expires; Prometheus `authorization` scrape config) and is audited and never cached. Samples are named `pontis_<key>`; labels are `window`, `representation` and `simulated`. Unavailable metrics have HELP and TYPE lines and no samples.",
  },
  authChallenge: {
    method: "post",
    path: "/v1/auth/challenge",
    summary: "Start a wallet sign-in",
    tag: "Auth",
    status: 200,
    response: AuthChallengeResponseSchema,
    body: AuthChallengeRequestSchema,
    errors: { ...VALIDATION, ...COMMON },
    description:
      "Returns a single-use nonce (5 minutes), the `recipient` and the exact `message` for the wallet's NEP-413 `signMessage`. Rate limited per client address. Not available in fixtures mode.",
  },
  authVerify: {
    method: "post",
    path: "/v1/auth/verify",
    summary: "Finish a wallet sign-in and open a session",
    tag: "Auth",
    status: 200,
    response: AuthVerifyResponseSchema,
    body: AuthVerifyRequestSchema,
    errors: { ...VALIDATION, 401: ["UNAUTHORIZED"], ...COMMON },
    description:
      "Checks the NEP-413 signature, that the key is an access key of the account (over RPC), consumes the nonce and returns a session token: 15 minutes, renewed by use up to 8 hours. An account that holds no role may sign in; it holds no admin rights. The signed message authorises a session only, never a chain transaction.",
  },
  authLogout: {
    method: "post",
    path: "/v1/auth/logout",
    summary: "End the session",
    tag: "Auth",
    status: 200,
    response: AuthLogoutResponseSchema,
    headers: AuthSessionHeaderSchema,
    errors: { 401: ["UNAUTHORIZED"], ...COMMON },
    description: "Revokes the session at once.",
  },
  authMe: {
    method: "get",
    path: "/v1/auth/me",
    summary: "The signed-in account and its roles",
    tag: "Auth",
    status: 200,
    response: AuthMeResponseSchema,
    headers: AuthSessionHeaderSchema,
    errors: { 401: ["UNAUTHORIZED"], ...COMMON },
    description:
      "Roles are read from the contract and cached for 60 seconds. Using the session renews it.",
  },
} as const satisfies Record<string, Endpoint>;

export type OperationId = keyof typeof ENDPOINTS;

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Invalid request",
  401: "Missing, expired or wrong credential",
  403: "Signed in, but the account holds no role this endpoint accepts",
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
          content: { [e.contentType ?? "application/json"]: { schema: e.response } },
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
