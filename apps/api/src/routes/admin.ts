// Admin-only endpoints (B13). Every handler checks the admin key first, and every call, allowed
// or refused, leaves an audit row.

import { ENDPOINTS } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import type { FastifyInstance } from "fastify";
import { adminActor, auditAdmin, type AdminAuditEntry } from "../admin/audit.ts";
import { requireAdmin } from "../admin/auth.ts";
import { getReconciliationReport } from "../admin/reconciliation.ts";

export function registerAdminRoutes(
  app: FastifyInstance,
  db: Db,
  adminApiKey: string | undefined,
): void {
  app.get(ENDPOINTS.getReconciliation.path, async (req) => {
    await authorizeAdmin(db, adminApiKey, req, "admin.reconciliation.read");
    return ENDPOINTS.getReconciliation.response.parse(await getReconciliationReport(db));
  });
}

/**
 * Checks the admin key and audits the call, refused or allowed. Throws `UNAUTHORIZED` for a
 * missing or wrong key. Shared by every admin-keyed route, so they audit the same way.
 */
export async function authorizeAdmin(
  db: Db,
  adminApiKey: string | undefined,
  req: { url: string; headers: { authorization?: string | undefined } },
  action: Exclude<AdminAuditEntry["action"], "admin.auth_failed">,
): Promise<void> {
  const subject = req.url.split("?")[0] ?? "";
  try {
    requireAdmin(adminApiKey, req.headers.authorization);
  } catch (error) {
    await auditAdmin(db, { actor: "anonymous", action: "admin.auth_failed", subject });
    throw error;
  }
  // Authorized, so the key exists.
  await auditAdmin(db, { actor: adminActor(adminApiKey ?? ""), action, subject });
}
