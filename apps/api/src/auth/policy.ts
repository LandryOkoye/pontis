// Which roles may call which admin endpoint (ADR 0019). A caller needs any one of `roles`.
// `sensitive` endpoints re-read the account's roles from the chain on every request; the rest use
// the session's cache (at most 60 seconds old).

import type { OperationId, RoleName } from "@pontis/api-types";
import type { AdminAuditEntry } from "../admin/audit.ts";

export interface AdminPolicy {
  roles: readonly RoleName[];
  sensitive: boolean;
  /** The audit action an allowed call records. */
  action: Exclude<
    AdminAuditEntry["action"],
    | "admin.auth_failed"
    | "admin.forbidden"
    | `auth.${string}`
    | `session.${string}`
    | `issuer.${string}`
  >;
}

/**
 * The people who run the protocol day to day: the owner and the three operating roles. The
 * attester roles sign attestations and see no operator data. Reconciliation findings and the
 * admin metrics are read-only views of the same state, so they share one set.
 */
export const OPERATOR_ROLES = [
  "owner",
  "registrar",
  "compat_approver",
  "pauser",
] as const satisfies readonly RoleName[];

export type AdminOperation = Extract<
  OperationId,
  "getReconciliation" | "getAdminMetrics" | "getPrometheusMetrics" | "getReserveMonitor"
>;

export const ADMIN_POLICY: Record<AdminOperation, AdminPolicy> = {
  // Names vault readings and quotes a person must act on: a revoked role must stop at once.
  getReconciliation: {
    roles: OPERATOR_ROLES,
    sensitive: true,
    action: "admin.reconciliation.read",
  },
  // Names the reserves that are breached or stale: the same operators, and as fresh as the findings.
  getReserveMonitor: {
    roles: OPERATOR_ROLES,
    sensitive: true,
    action: "admin.reserve_monitor.read",
  },
  getAdminMetrics: { roles: OPERATOR_ROLES, sensitive: false, action: "admin.metrics.read" },
  getPrometheusMetrics: {
    roles: OPERATOR_ROLES,
    sensitive: false,
    action: "admin.prometheus.read",
  },
};
