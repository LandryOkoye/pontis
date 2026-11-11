// Protocol metrics: the public aggregates, the admin view and the Prometheus text. All three read
// one snapshot builder (`../metrics/collect.ts`).
//
// `GET /metrics` takes the admin key because it exports per-representation amounts and open
// reconciliation counts that the public endpoint deliberately omits; scrape it with a bearer
// token. It is audited and never cached.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { adminMetrics, protocolMetrics, type MetricsDeps } from "../metrics/collect.ts";
import { PROMETHEUS_CONTENT_TYPE, renderPrometheus } from "../metrics/prometheus.ts";
import { authorizeAdmin } from "./admin.ts";

export interface MetricsRouteDeps {
  db: Db;
  chainHeight: () => Promise<number>;
  now?: () => Date;
  adminApiKey?: string | undefined;
}

export function registerMetricsRoutes(app: FastifyInstance, deps: MetricsRouteDeps): void {
  const snapshotDeps: MetricsDeps = {
    db: deps.db,
    chainHeight: deps.chainHeight,
    now: deps.now ?? (() => new Date()),
  };
  const e = ENDPOINTS;

  app.get(e.getProtocolMetrics.path, async () =>
    e.getProtocolMetrics.response.parse(await protocolMetrics(snapshotDeps)),
  );

  app.get(e.getAdminMetrics.path, async (req) => {
    await authorizeAdmin(deps.db, deps.adminApiKey, req, "admin.metrics.read");
    return e.getAdminMetrics.response.parse(await adminMetrics(snapshotDeps));
  });

  app.get(e.getPrometheusMetrics.path, async (req, reply) => {
    await authorizeAdmin(deps.db, deps.adminApiKey, req, "admin.prometheus.read");
    const view = e.getAdminMetrics.response.parse(await adminMetrics(snapshotDeps));
    return reply.type(PROMETHEUS_CONTENT_TYPE).send(renderPrometheus(view));
  });
}
