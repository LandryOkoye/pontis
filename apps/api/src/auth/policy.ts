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

export type SessionOperation = Extract<
  OperationId,
  | "prepareRedemption"
  | "reclaimRedemptionIntent"
  | "listIssuerRedemptions"
  | "acceptRedemption"
  | "rejectRedemption"
  | "fulfilRedemption"
  | "listIssuerMintRequests"
  | "createIssuerMintRequest"
  | "executeIssuerMintRequest"
>;

/**
 * Who may call each session endpoint (ADR 0020 section 10). Not an admin policy: there is no
 * break-glass key here, because every call is made as an account.
 *
 * - `account`: any signed-in account, acting on its own records (the redemption's owner).
 * - `issuer`: an account in the `controlled_accounts` of the issuer of the record, read from the
 *   chain on each call. It is the check the contract makes on `accept_redemption` and the rest,
 *   so the API refuses what the chain would.
 * - `issuer_or_operator`: as `issuer`, and an operator role may also read (never act): the queue
 *   is public chain data, and an operator watching it needs no key of the issuer.
 */
export interface SessionPolicy {
  access: "account" | "issuer" | "issuer_or_operator";
  action: Extract<AdminAuditEntry["action"], `session.${string}` | `issuer.${string}`>;
}

export const SESSION_POLICY: Record<SessionOperation, SessionPolicy> = {
  prepareRedemption: { access: "account", action: "session.redemption.prepare" },
  reclaimRedemptionIntent: { access: "account", action: "session.redemption.reclaim_intent" },
  listIssuerRedemptions: { access: "issuer_or_operator", action: "issuer.redemptions.read" },
  acceptRedemption: { access: "issuer", action: "issuer.redemption.accept" },
  rejectRedemption: { access: "issuer", action: "issuer.redemption.reject" },
  fulfilRedemption: { access: "issuer", action: "issuer.redemption.fulfil" },
  listIssuerMintRequests: { access: "issuer_or_operator", action: "issuer.mint_requests.read" },
  createIssuerMintRequest: { access: "issuer", action: "issuer.mint_request.create" },
  executeIssuerMintRequest: { access: "issuer", action: "issuer.mint_request.execute" },
};
