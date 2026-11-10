// POST /v1/conversions, POST /v1/conversions/{id}/submitted, GET /v1/transactions[/{id}]
// (BuildPlan §8). The backend never signs for users: it returns the unsigned wallet plan.

import { ENDPOINTS } from "@pontis/api-types";
import type { TxVerifier } from "@pontis/near-client";
import type { FastifyInstance } from "fastify";
import { acceptQuote, type AcceptDeps } from "../conversions/accept.ts";
import { reportSubmitted } from "../conversions/submit.ts";
import { getTransaction, listTransactions } from "../conversions/transactions.ts";
import { notFound } from "../errors.ts";

const route = (path: string) => path.replace(/\{(\w+)\}/g, ":$1");

export interface ConversionRouteDeps extends AcceptDeps {
  verifier: TxVerifier;
}

export function registerConversionRoutes(app: FastifyInstance, deps: ConversionRouteDeps): void {
  const e = ENDPOINTS;
  app.post(e.createConversion.path, async (req, reply) => {
    const { "idempotency-key": key } = e.createConversion.headers.parse(req.headers);
    const { quoteId } = e.createConversion.body.parse(req.body);
    void reply.code(e.createConversion.status);
    return e.createConversion.response.parse(await acceptQuote(deps, quoteId, key));
  });
  app.post(route(e.markConversionSubmitted.path), async (req) => {
    const { id } = e.markConversionSubmitted.params.parse(req.params);
    const { txHash } = e.markConversionSubmitted.body.parse(req.body);
    return e.markConversionSubmitted.response.parse(
      await reportSubmitted(
        {
          db: deps.db,
          verifier: deps.verifier,
          coreId: deps.coreId,
          log: req.log,
          ...(deps.now ? { now: deps.now() } : {}),
        },
        id,
        txHash,
      ),
    );
  });
  app.get(route(e.getTransaction.path), async (req) => {
    const { id } = e.getTransaction.params.parse(req.params);
    const tx = await getTransaction(deps.db, id);
    if (!tx) throw notFound("Transaction");
    return e.getTransaction.response.parse(tx);
  });
  app.get(e.listTransactions.path, async (req) => {
    const { account, limit } = e.listTransactions.query.parse(req.query);
    return e.listTransactions.response.parse({
      items: await listTransactions(deps.db, account, limit),
    });
  });
}
