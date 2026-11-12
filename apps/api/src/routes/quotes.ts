// POST /v1/routes/compare, POST /v1/quotes, GET /v1/quotes/{id} (BuildPlan §8). Request bodies are
// strict Zod schemas from `@pontis/api-types`; responses are validated before they are sent.

import { ENDPOINTS } from "@pontis/api-types";
import type { FastifyInstance } from "fastify";
import { notFound } from "../errors.ts";
import { compareRoutes } from "../quotes/compare.ts";
import { routeGuards } from "../quotes/guards.ts";
import { getQuote } from "../quotes/lifecycle.ts";
import { createQuote, type QuoteDeps } from "../quotes/service.ts";

const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export function registerQuoteRoutes(app: FastifyInstance, deps: QuoteDeps): void {
  const e = ENDPOINTS;
  app.post(e.compareRoutes.path, async (req) => {
    const body = e.compareRoutes.body.parse(req.body);
    return e.compareRoutes.response.parse(await compareRoutes(deps.db, deps.chain, body));
  });
  app.get(route(e.getRouteGuards.path), async (req) => {
    const { fromId, toId } = e.getRouteGuards.params.parse(req.params);
    const { amount } = e.getRouteGuards.query.parse(req.query);
    const now = (deps.now ?? (() => new Date()))();
    return e.getRouteGuards.response.parse(
      await routeGuards(deps.db, deps.chain, fromId, toId, amount, now),
    );
  });
  app.post(e.createQuote.path, async (req, reply) => {
    const body = e.createQuote.body.parse(req.body);
    void reply.code(e.createQuote.status);
    return e.createQuote.response.parse(await createQuote(deps, body));
  });
  app.get(route(e.getQuote.path), async (req) => {
    const { id } = e.getQuote.params.parse(req.params);
    const quote = await getQuote(deps.db, id, deps.now?.());
    if (!quote) throw notFound("Quote");
    return e.getQuote.response.parse(quote);
  });
}
