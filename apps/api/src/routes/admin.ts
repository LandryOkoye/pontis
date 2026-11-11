// Admin-only endpoints (B13). Every handler passes the admin gate first (`auth/authorize.ts`: a
// wallet session with a role the policy table allows, or the break-glass key), and every call,
// allowed or refused, leaves an audit row.

import { ENDPOINTS } from "@pontis/api-types";
import type { FastifyInstance } from "fastify";
import { getReconciliationReport } from "../admin/reconciliation.ts";
import { getReserveMonitorReport } from "../admin/reserve-monitor.ts";
import { authorizeAdmin, type AuthContext } from "../auth/authorize.ts";

export function registerAdminRoutes(app: FastifyInstance, ctx: AuthContext): void {
  app.get(ENDPOINTS.getReconciliation.path, async (req) => {
    await authorizeAdmin(ctx, req, "getReconciliation");
    return ENDPOINTS.getReconciliation.response.parse(await getReconciliationReport(ctx.db));
  });
  app.get(ENDPOINTS.getReserveMonitor.path, async (req) => {
    await authorizeAdmin(ctx, req, "getReserveMonitor");
    return ENDPOINTS.getReserveMonitor.response.parse(await getReserveMonitorReport(ctx.db));
  });
}
