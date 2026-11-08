import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/client.ts";
import { errorHandler, notFoundHandler } from "./errors.ts";
import { registerCatalogRoutes } from "./routes/catalog.ts";
import { registerHealthRoute } from "./routes/health.ts";

export interface AppDeps {
  db: Db;
  /** Latest chain height from the NEAR RPC; may reject. */
  chainHeight: () => Promise<number>;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerHealthRoute(app, deps.db, deps.chainHeight);
  registerCatalogRoutes(app, deps.db);
  return app;
}
