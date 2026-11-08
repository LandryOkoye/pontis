import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/client.ts";
import { errorHandler, notFoundHandler } from "./errors.ts";
import { registerCatalogRoutes } from "./routes/catalog.ts";
import type { QuoteDeps } from "./quotes/service.ts";
import { registerHealthRoute } from "./routes/health.ts";
import { registerQuoteRoutes } from "./routes/quotes.ts";

export interface AppDeps {
  db: Db;
  /** Latest chain height from the NEAR RPC; may reject. */
  chainHeight: () => Promise<number>;
  /** Chain reads, signing key and core account for quoting. */
  quotes: Omit<QuoteDeps, "db">;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerHealthRoute(app, deps.db, deps.chainHeight);
  registerCatalogRoutes(app, deps.db);
  registerQuoteRoutes(app, { db: deps.db, ...deps.quotes });
  return app;
}
