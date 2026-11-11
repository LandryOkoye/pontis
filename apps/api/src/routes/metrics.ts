// Protocol metrics: the public aggregates, the admin view and the Prometheus text. All three read
// one snapshot builder (`../metrics/collect.ts`).
//
// `GET /metrics` takes the admin credentials (a session whose account holds an operator role, or
// the break-glass key, which is what a scraper should use) because it exports per-representation
// amounts and open reconciliation counts that the public endpoint deliberately omits. It is
// audited and never cached.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { adminMetrics, protocolMetrics, type MetricsDeps } from "../metrics/collect.ts";
import { PROMETHEUS_CONTENT_TYPE, renderPrometheus } from "../metrics/prometheus.ts";
import { authorizeAdmin } from "../auth/authorize.ts";
import type { AuthDeps } from "../auth/types.ts";

export interface MetricsRouteDeps {
  db: Db;
  chainHeight: () => Promise<number>;
  now?: () => Date;
  adminApiKey?: string | undefined;
  auth: AuthDeps;
}

export function registerMetricsRoutes(app: FastifyInstance, deps: MetricsRouteDeps): void {
  const snapshotDeps: MetricsDeps = {
    db: deps.db,
    chainHeight: deps.chainHeight,
    now: deps.now ?? (() => new Date()),
  };
  const e = ENDPOINTS;
  const ctx = { db: deps.db, auth: deps.auth, adminApiKey: deps.adminApiKey };

  app.get(e.getProtocolMetrics.path, async () =>
    e.getProtocolMetrics.response.parse(await protocolMetrics(snapshotDeps)),
  );

  app.get(e.getAdminMetrics.path, async (req) => {
    await authorizeAdmin(ctx, req, "getAdminMetrics");
    return e.getAdminMetrics.response.parse(await adminMetrics(snapshotDeps));
  });

  app.get(e.getPrometheusMetrics.path, async (req, reply) => {
    await authorizeAdmin(ctx, req, "getPrometheusMetrics");
    const view = e.getAdminMetrics.response.parse(await adminMetrics(snapshotDeps));
    return reply.type(PROMETHEUS_CONTENT_TYPE).send(renderPrometheus(view));
  });
}
