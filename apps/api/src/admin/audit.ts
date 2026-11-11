// Audit trail for privileged calls (brief §10.1): who did what, never the credential itself and
// never the caller's address. Since ADR 0019 `actor` is the NEAR account of a wallet sign-in and
// `actorKey` the access key that signed it; the break-glass admin key is `legacy-admin-key`.

import { createHash } from "node:crypto";
import { auditLog, type Db } from "@pontis/db";

/** The `actor` of a call made with the shared `ADMIN_API_KEY`. */
export const LEGACY_ACTOR = "legacy-admin-key";

/** A short stable label for a legacy key, kept in `detail` so a rotation shows in the log. */
export function keyFingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export interface AdminAuditEntry {
  /** An account ID, `legacy-admin-key`, or `anonymous` for a call with no valid credential. */
  actor: string;
  action:
    | "admin.reconciliation.read"
    | "admin.metrics.read"
    | "admin.prometheus.read"
    | "admin.auth_failed"
    | "admin.forbidden"
    | "auth.sign_in"
    | "auth.sign_in_failed"
    | "auth.logout";
  subject: string;
  /** The access key (`ed25519:...`) behind a wallet sign-in; absent for the legacy key. */
  actorKey?: string;
  detail?: Record<string, unknown>;
}

export async function auditAdmin(db: Db, entry: AdminAuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    subject: entry.subject,
    actorKey: entry.actorKey ?? null,
    detail: entry.detail ?? {},
  });
}
