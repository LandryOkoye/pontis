// The asset directory and chart reads (brief section 12.4). Public, cacheable, validated against
// the schemas in `@pontis/api-types` before they are sent.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { listDirectory } from "../market/directory.ts";

/** OpenAPI `/v1/assets/{id}` to Fastify `/v1/assets/:id`. */
const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export interface MarketRouteDeps {
  db: Db;
  now?: () => Date;
}

export function registerMarketRoutes(app: FastifyInstance, deps: MarketRouteDeps): void {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const e = ENDPOINTS;

  app.get(route(e.listAssets.path), async (req) =>
    e.listAssets.response.parse(
      await listDirectory(db, e.listAssets.query.parse(req.query), now()),
    ),
  );
}
