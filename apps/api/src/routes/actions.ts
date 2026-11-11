// GET /v1/assets/{id}/lifecycle, /corporate-actions and /nav: read live from the chain, never cached.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import type { ActionsChain } from "../actions/chain.ts";
import { assetCorporateActions, assetLifecycle, assetNav } from "../actions/service.ts";

const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export interface ActionRouteDeps {
  db: Db;
  chain: ActionsChain;
  now?: () => Date;
}

export function registerActionRoutes(app: FastifyInstance, deps: ActionRouteDeps): void {
  const e = ENDPOINTS;
  const now = () => (deps.now ?? (() => new Date()))();
  app.get(route(e.getAssetLifecycle.path), async (req) => {
    const { id } = e.getAssetLifecycle.params.parse(req.params);
    return e.getAssetLifecycle.response.parse(await assetLifecycle(deps.db, deps.chain, id));
  });
  app.get(route(e.getAssetCorporateActions.path), async (req) => {
    const { id } = e.getAssetCorporateActions.params.parse(req.params);
    return e.getAssetCorporateActions.response.parse(
      await assetCorporateActions(deps.db, deps.chain, id, now()),
    );
  });
  app.get(route(e.getAssetNav.path), async (req) => {
    const { id } = e.getAssetNav.params.parse(req.params);
    return e.getAssetNav.response.parse(await assetNav(deps.db, deps.chain, id, now()));
  });
}
