// The asset directory and chart reads (brief section 12.4). Public, cacheable, validated against
// the schemas in `@pontis/api-types` before they are sent.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { notFound } from "../errors.ts";
import { priceChart, representationExists, resolveRange, volumeChart } from "../market/charts.ts";
import { listDirectory } from "../market/directory.ts";
import { marketCategories, marketMovers, marketOverview } from "../market/overview.ts";
import { marketChains } from "../market/chains.ts";
import { navChart, supplyChart } from "../market/series-charts.ts";

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

  app.get(route(e.getMarketOverview.path), async (req) =>
    e.getMarketOverview.response.parse(
      await marketOverview(db, e.getMarketOverview.query.parse(req.query).data, now()),
    ),
  );
  app.get(route(e.getMarketMovers.path), async (req) => {
    const q = e.getMarketMovers.query.parse(req.query);
    return e.getMarketMovers.response.parse(await marketMovers(db, q.data, q.limit));
  });
  app.get(route(e.getMarketCategories.path), async (req) =>
    e.getMarketCategories.response.parse(
      await marketCategories(db, e.getMarketCategories.query.parse(req.query).data),
    ),
  );
  app.get(route(e.getMarketChains.path), async (req) =>
    e.getMarketChains.response.parse(
      await marketChains(db, e.getMarketChains.query.parse(req.query).data),
    ),
  );

  const charts = [
    [e.getAssetPriceChart, priceChart],
    [e.getAssetNavChart, navChart],
    [e.getAssetSupplyChart, supplyChart],
    [e.getAssetVolumeChart, volumeChart],
  ] as const;
  for (const [endpoint, read] of charts) {
    app.get(route(endpoint.path), async (req) => {
      const { id } = endpoint.params.parse(req.params);
      const query = endpoint.query.parse(req.query);
      if (!(await representationExists(db, id))) throw notFound("Asset");
      return endpoint.response.parse(await read(db, id, resolveRange(query, now()), query.data));
    });
  }
}
