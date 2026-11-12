import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "@pontis/db";
import { errorHandler, notFoundHandler } from "./errors.ts";
import { loggerOptions } from "./logging.ts";
import { registerCatalogRoutes } from "./routes/catalog.ts";
import type { ConversionChain } from "./conversions/chain.ts";
import type { QuoteDeps } from "./quotes/service.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerConversionRoutes } from "./routes/conversions.ts";
import { registerHealthRoute } from "./routes/health.ts";
import { registerQuoteRoutes } from "./routes/quotes.ts";
import { registerSecurity, type SecurityOptions } from "./security/index.ts";
import {
  PrivateRfqMatcher,
  SimulatedIntentsClient,
  type IntentsClient,
} from "@pontis/intents-private";
import { registerIntentsRoutes } from "./routes/intents.ts";
import { registerPrivateRfqRoutes } from "./routes/private-rfq.ts";

export interface AppDeps {
  db: Db;
  /** Latest chain height from the NEAR RPC; may reject. */
  chainHeight: () => Promise<number>;
  /** Chain reads, signing key and core account for quoting. */
  quotes: Omit<QuoteDeps, "db">;
  /** Token registration reads for the wallet plan. */
  conversionChain: ConversionChain;
  /** Bearer key for the admin endpoints; without one they refuse everyone. */
  adminApiKey?: string;
  /** Defaults to the offline simulator. Production 1Click use requires explicit client injection. */
  intents?: IntentsClient;
  /** Defaults to a local RFQ matcher for synthetic `sim:` asset identifiers only. */
  privateRfq?: PrivateRfqMatcher;
  /** CORS origins and rate limits; see `registerSecurity`. */
  security?: SecurityOptions;
  logger?: boolean;
  /** Where log lines go when `logger` is on; default is stdout. */
  logStream?: Writable;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ? loggerOptions(deps.logStream) : false,
    bodyLimit: 16 * 1024,
    trustProxy: deps.security?.trustProxy ?? false,
  });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerSecurity(app, deps.security ?? { corsOrigins: [] });
  // Queued after the security plugins, so their hooks cover every route below.
  app.register(async (scope) => {
    registerHealthRoute(scope, deps.db, deps.chainHeight);
    registerIntentsRoutes(scope, deps.intents ?? new SimulatedIntentsClient());
    registerPrivateRfqRoutes(
      scope,
      deps.privateRfq ??
        new PrivateRfqMatcher({
          oraclePrice: (assetId) => (assetId.startsWith("sim:") ? 100n : undefined),
          maxOracleDeviationBps: 1_000n,
        }),
    );
    registerCatalogRoutes(scope, deps.db);
    registerQuoteRoutes(scope, { db: deps.db, ...deps.quotes });
    registerConversionRoutes(scope, {
      db: deps.db,
      chain: deps.conversionChain,
      coreId: deps.quotes.coreId,
      ...(deps.quotes.now ? { now: deps.quotes.now } : {}),
    });
    registerAdminRoutes(scope, deps.db, deps.adminApiKey);
  });
  return app;
}
