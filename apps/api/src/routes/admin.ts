// Admin-only endpoints (B13). Every handler checks the admin key first.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../admin/auth.ts";
import { getReconciliationReport } from "../admin/reconciliation.ts";

export function registerAdminRoutes(
  app: FastifyInstance,
  db: Db,
  adminApiKey: string | undefined,
): void {
  app.get(ENDPOINTS.getReconciliation.path, async (req) => {
    requireAdmin(adminApiKey, req.headers.authorization);
    return ENDPOINTS.getReconciliation.response.parse(await getReconciliationReport(db));
  });
}
