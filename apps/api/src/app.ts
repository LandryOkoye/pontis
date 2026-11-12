import type { Writable } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "@pontis/db";
import type { TxVerifier } from "@pontis/near-client";
import { errorHandler, notFoundHandler } from "./errors.ts";
import { loggerOptions } from "./logging.ts";
import { registerPublicCaching } from "./routes/caching.ts";
import { registerCatalogRoutes } from "./routes/catalog.ts";
import { registerMetricsRoutes } from "./routes/metrics.ts";
import { registerMarketRoutes } from "./routes/market.ts";
import type { ConversionChain } from "./conversions/chain.ts";
import type { ActionsChain } from "./actions/chain.ts";
import type { QuoteDeps } from "./quotes/service.ts";
import { registerActionRoutes } from "./routes/actions.ts";
import type { CustodyRepository, ReserveRelayer } from "./custody/chain.ts";
import { registerCustodyRoutes } from "./routes/custody.ts";
import type { AuthDeps } from "./auth/types.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerConversionRoutes } from "./routes/conversions.ts";
import { registerHealthRoute, type HealthOptions } from "./routes/health.ts";
import { registerQuoteRoutes } from "./routes/quotes.ts";
import { registerIssuerRoutes } from "./routes/issuer.ts";
import { registerRedemptionRoutes } from "./routes/redemptions.ts";
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
  /** Indexer staleness and lag thresholds and the clock for them; see `HealthOptions`. */
  health?: HealthOptions;
  /** Chain reads, signing key and core account for quoting. */
  quotes: Omit<QuoteDeps, "db">;
  /** Corporate action, lifecycle and NAV strike reads for the asset endpoints. */
  actionsChain: ActionsChain;
  /** Custody, reserve, redemption and reliability reads. */
  custodyChain: CustodyRepository;
  /** Sends relayed reserve attestations; without it the relay endpoint answers 404. */
  reserveRelayer?: ReserveRelayer;
  /** Token registration reads for the wallet plan. */
  conversionChain: ConversionChain;
  /** Checks reported transaction hashes against the chain before they are shown as verified. */
  txVerifier: TxVerifier;
  /** Clock for market reads (chart ranges, sparklines); tests pin it. */
  now?: () => Date;
  /** Wallet sign-in: the chain reads behind it, the NEP-413 recipient and the network. */
  auth: AuthDeps;
  /** Break-glass bearer key for the admin endpoints (labelled `legacy-admin-key`); unset turns it off. */
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
    registerHealthRoute(scope, deps.db, deps.chainHeight, deps.health);
    registerPublicCaching(scope);
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
    registerMarketRoutes(scope, {
      db: deps.db,
      chainHeight: deps.chainHeight,
      ...(deps.health ? { health: deps.health } : {}),
      ...(deps.now ? { now: deps.now } : {}),
    });
    registerQuoteRoutes(scope, { db: deps.db, ...deps.quotes });
    registerActionRoutes(scope, {
      db: deps.db,
      chain: deps.actionsChain,
      ...(deps.now ? { now: deps.now } : {}),
    });
    registerCustodyRoutes(scope, {
      db: deps.db,
      chain: deps.custodyChain,
      relayer: deps.reserveRelayer,
      coreId: deps.quotes.coreId,
      ...(deps.now ? { now: deps.now } : {}),
    });
    registerConversionRoutes(scope, {
      db: deps.db,
      chain: deps.conversionChain,
      verifier: deps.txVerifier,
      coreId: deps.quotes.coreId,
      ...(deps.quotes.now ? { now: deps.quotes.now } : {}),
    });
    const authContext = { db: deps.db, auth: deps.auth, adminApiKey: deps.adminApiKey };
    registerAuthRoutes(scope, authContext);
    const sessionRoutes = {
      auth: authContext,
      chain: deps.custodyChain,
      coreId: deps.quotes.coreId,
      ...(deps.now ? { now: deps.now } : {}),
    };
    registerRedemptionRoutes(scope, sessionRoutes);
    registerIssuerRoutes(scope, sessionRoutes);
    registerAdminRoutes(scope, authContext);
    registerMetricsRoutes(scope, {
      db: deps.db,
      chainHeight: deps.chainHeight,
      adminApiKey: deps.adminApiKey,
      auth: deps.auth,
      ...(deps.now ? { now: deps.now } : {}),
    });
  });
  return app;
}
