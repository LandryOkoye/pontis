// `API_MODE=fixtures` (brief section 16): serves the fixtures from `@pontis/api-types` so the
// frontend can build screens without a chain or a database. Every response says so with
// `x-pontis-mode: fixtures`; the data is the same simulated example data the schemas are tested
// against, not a view of anything real. Operations that need a live chain answer 404.

import { ENDPOINTS, type OperationId } from "@pontis/api-types";
import * as fx from "@pontis/api-types/fixtures";
import Fastify, { type FastifyInstance } from "fastify";
import type { z } from "zod";
import { AppError, errorHandler, notFoundHandler } from "./errors.ts";
import { registerSecurity, type SecurityOptions } from "./security/index.ts";

const byId = <T extends { id: string }>(items: readonly T[], id: string, what: string): T => {
  const found = items.find((i) => i.id === id);
  if (!found) throw new AppError("NOT_FOUND", 404, `${what} not found`);
  return found;
};

type Params = Record<string, string>;

/** What this file needs of an endpoint definition (the literal types differ per endpoint). */
interface EndpointShape {
  method: "get" | "post";
  path: string;
  status: number;
  response: z.ZodType;
  params?: z.ZodObject;
  query?: z.ZodObject;
}
type Handler = (params: Params) => unknown;

/** The fixture for each operation. Keep in step with `ENDPOINTS`: a test fails on a gap. */
const HANDLERS: Partial<Record<OperationId, Handler>> = {
  getHealth: () => fx.health,
  getHealthLive: () => ({ status: "ok" }),
  getHealthReady: () => fx.health,
  listIssuers: () => ({ items: [fx.issuerSummaryA, fx.issuerSummaryB] }),
  getIssuer: (p) => byId([fx.issuerA, fx.issuerB], p.id as string, "Issuer"),
  listAssets: () => fx.assetDirectory,
  getAsset: (p) => byId([fx.tgoldA, fx.tgoldB], p.id as string, "Asset"),
  getAssetCompatibility: (p) => ({
    items: [p.id === "tgold-b" ? fx.compatibilityFromB : fx.compatibilityFromA],
  }),
  getAssetPriceChart: (p) => ({ ...fx.priceChart, representationId: p.id }),
  getAssetNavChart: (p) => ({ ...fx.navChart, representationId: p.id }),
  getAssetSupplyChart: (p) => ({ ...fx.supplyChart, representationId: p.id }),
  getAssetVolumeChart: (p) => ({ ...fx.volumeChart, representationId: p.id }),
  getAssetMetadata: (p) => ({ ...fx.assetMetadata, id: p.id }),
  getAssetIssuer: () => fx.assetIssuerView,
  getAssetChains: () => fx.assetChainList,
  getAssetDocuments: () => fx.assetDocumentList,
  getAssetActivity: () => fx.activityList,
  getMarketOverview: () => fx.marketOverview,
  getMarketMovers: () => fx.marketMovers,
  getMarketCategories: () => fx.categoryList,
  getMarketChains: () => fx.chainList,
  compareAssets: () => fx.compareResponse,
  search: () => fx.searchResult,
  getIssuerLeaderboard: () => fx.issuerLeaderboard,
  getStatus: () => fx.status,
  createQuote: () => fx.quote,
  getQuote: () => fx.quote,
  getTransaction: () => fx.transactionSettled,
  listTransactions: () => ({ items: [fx.transactionSettled] }),
};

/** Operations that need a live chain, a signer or a database; fixtures mode refuses them. */
export const UNAVAILABLE_IN_FIXTURES: readonly OperationId[] = [
  "compareRoutes",
  "createConversion",
  "markConversionSubmitted",
  "getReconciliation",
];

export function buildFixturesApp(security: SecurityOptions = { corsOrigins: [] }): FastifyInstance {
  const app = Fastify({ bodyLimit: 16 * 1024 });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerSecurity(app, security);
  app.register(async (scope) => {
    scope.addHook("onSend", async (_req, reply) => {
      void reply.header("x-pontis-mode", "fixtures");
    });
    for (const [operationId, endpoint] of Object.entries(ENDPOINTS) as [
      OperationId,
      EndpointShape,
    ][]) {
      const path = endpoint.path.replace(/\{(\w+)\}/g, ":$1");
      const handler = HANDLERS[operationId];
      scope.route({
        method: endpoint.method.toUpperCase() as "GET" | "POST",
        url: path,
        handler: async (req, reply) => {
          if (!handler) {
            throw new AppError(
              "NOT_FOUND",
              404,
              `${operationId} is not available in fixtures mode; it needs a live chain`,
            );
          }
          // Validate params and query the same way the real server does, so the frontend meets
          // the same 400s; the response is the fixture, checked against the schema.
          const params = (endpoint.params ? endpoint.params.parse(req.params) : {}) as Params;
          if (endpoint.query) endpoint.query.parse(req.query);
          void reply.code(endpoint.status);
          return endpoint.response.parse(handler(params));
        },
      });
    }
  });
  return app;
}
