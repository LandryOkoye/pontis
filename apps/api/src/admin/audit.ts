// Audit trail for privileged calls (brief §10.1): who did what, never the credential itself and
// never the caller's address.

import { createHash } from "node:crypto";
import { auditLog, type Db } from "@pontis/db";

/** A short stable label for a key, so entries can be told apart without revealing it. */
export function adminActor(key: string): string {
  return `admin:${createHash("sha256").update(key).digest("hex").slice(0, 8)}`;
}

export interface AdminAuditEntry {
  /** `adminActor(key)` for an authorized call, `anonymous` for a refused one. */
  actor: string;
  action: "admin.reconciliation.read" | "admin.auth_failed";
  subject: string;
}

export async function auditAdmin(db: Db, entry: AdminAuditEntry): Promise<void> {
  await db.insert(auditLog).values({ ...entry, detail: {} });
}
