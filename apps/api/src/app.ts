import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db/client.ts";
import { errorHandler, notFoundHandler } from "./errors.ts";
import { registerCatalogRoutes } from "./routes/catalog.ts";

export interface AppDeps {
  db: Db;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  registerCatalogRoutes(app, deps.db);
  return app;
}
