// The MVP endpoint table (BuildPlan §8). This is the single source for both the generated
// `openapi.yaml` and the typed `ENDPOINTS` map that clients and mocks use.
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import type { ErrorCodeSchema } from "./common.ts";
import { ApiErrorSchema } from "./common.ts";
import { AdminAuthHeaderSchema, ReconciliationReportSchema } from "./admin-types.ts";
import {
  AssetSchema,
  AssetSummarySchema,
  CompatibilitySchema,
  HealthSchema,
  IssuerSchema,
  IssuerSummarySchema,
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

export const IssuerListSchema = z
  .object({ items: z.array(IssuerSummarySchema) })
  .meta({ id: "IssuerList" });
export const AssetListSchema = z
  .object({ items: z.array(AssetSummarySchema) })
  .meta({ id: "AssetList" });
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
    "Health" | "Registry" | "Routes" | "Quotes" | "Conversions" | "Transactions" | "Admin";
  readonly status: number;
  readonly response: z.ZodType;
  /** Error codes this endpoint can return, with their HTTP status. */
  readonly errors: Readonly<Record<number, readonly z.infer<typeof ErrorCodeSchema>[]>>;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodObject;
  readonly headers?: z.ZodObject;
  readonly body?: z.ZodType;
  readonly description?: string;
}

const VALIDATION = { 400: ["VALIDATION_ERROR"] } as const;
const COMMON = { 429: ["RATE_LIMITED"], 500: ["INTERNAL"] } as const;

/** Keyed by operation ID. */
export const ENDPOINTS = {
  getHealth: {
    method: "get",
    path: "/v1/health",
    summary: "Service health",
    tag: "Health",
    status: 200,
    response: HealthSchema,
    errors: { ...COMMON },
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
    summary: "List asset representations",
    tag: "Registry",
    status: 200,
    response: AssetListSchema,
    errors: { ...COMMON },
    description:
      "Each representation embeds its canonical claim name and issuer summary. Canonical claim and representation are separate records; use `GET /v1/assets/{id}` for the claim detail.",
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
      ...COMMON,
    },
    description:
      "Moves the quote to `SUBMITTED`. Repeating with the same hash is a no-op; a different hash is a conflict.",
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
