// Admin-only endpoints (B13). Every handler checks the admin key first, and every call, allowed
// or refused, leaves an audit row.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { adminActor, auditAdmin } from "../admin/audit.ts";
import { requireAdmin } from "../admin/auth.ts";
import { getReconciliationReport } from "../admin/reconciliation.ts";

export function registerAdminRoutes(
  app: FastifyInstance,
  db: Db,
  adminApiKey: string | undefined,
): void {
  app.get(ENDPOINTS.getReconciliation.path, async (req) => {
    const subject = req.url.split("?")[0] ?? "";
    try {
      requireAdmin(adminApiKey, req.headers.authorization);
    } catch (error) {
      await auditAdmin(db, { actor: "anonymous", action: "admin.auth_failed", subject });
      throw error;
    }
    // Authorized, so the key exists.
    await auditAdmin(db, {
      actor: adminActor(adminApiKey ?? ""),
      action: "admin.reconciliation.read",
      subject,
    });
    return ENDPOINTS.getReconciliation.response.parse(await getReconciliationReport(db));
  });
}
