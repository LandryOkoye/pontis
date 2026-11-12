// GET /v1/issuers, /v1/assets and their detail and compatibility views (BuildPlan §8). Paths and
// schemas come from `@pontis/api-types`, and every payload is validated against its schema before it
// is sent, so the contract the frontend mocks against is the contract the server keeps.

import { ENDPOINTS } from "@pontis/api-types";
import type { FastifyInstance } from "fastify";
import { getAsset, getAssetCompatibility, getIssuer, listIssuers } from "../catalog/repository.ts";
import type { Db } from "@pontis/db";
import { notFound } from "../errors.ts";

/** OpenAPI `/v1/assets/{id}` to Fastify `/v1/assets/:id`. */
const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export function registerCatalogRoutes(app: FastifyInstance, db: Db): void {
  const e = ENDPOINTS;
  app.get(route(e.listIssuers.path), async () =>
    e.listIssuers.response.parse({ items: await listIssuers(db) }),
  );
  app.get(route(e.getIssuer.path), async (req) => {
    const { id } = e.getIssuer.params.parse(req.params);
    const issuer = await getIssuer(db, id);
    if (!issuer) throw notFound("Issuer");
    return e.getIssuer.response.parse(issuer);
  });
  app.get(route(e.getAsset.path), async (req) => {
    const { id } = e.getAsset.params.parse(req.params);
    const asset = await getAsset(db, id);
    if (!asset) throw notFound("Asset");
    return e.getAsset.response.parse(asset);
  });
  app.get(route(e.getAssetCompatibility.path), async (req) => {
    const { id } = e.getAssetCompatibility.params.parse(req.params);
    const items = await getAssetCompatibility(db, id);
    if (!items) throw notFound("Asset");
    return e.getAssetCompatibility.response.parse({ items });
  });
}
