// Who may act as an issuer's back-office (ADR 0020 sections 6, 7 and 10). The contract lets an
// account call `accept_redemption`, `request_mint` and the rest when it is listed in the
// `controlled_accounts` of the representation's active issuer. The API checks the same thing,
// from the chain on every call, so it refuses what the chain would and never offers an unsigned
// action that is bound to fail on authority. The listing is a registrar's unproven claim (ADR 0019),
// so this is a labelled mock of an issuer login, not authentication of an issuer.

import { auditAdmin } from "../admin/audit.ts";
import { OPERATOR_ROLES } from "../auth/policy.ts";
import type { Db } from "@pontis/db";
import { assetRepresentations, issuers } from "@pontis/db";
import type { RoleName } from "@pontis/api-types";
import { AppError, notFound } from "../errors.ts";
import type { Caller } from "./intent-context.ts";
import type { CustodyRepository } from "./chain.ts";

export const isOperator = (roles: readonly RoleName[]) =>
  roles.some((role) => (OPERATOR_ROLES as readonly string[]).includes(role));

async function controls(
  chain: CustodyRepository,
  issuerId: string,
  accountId: string,
): Promise<boolean> {
  const issuer = await chain.getIssuer(issuerId);
  return (
    issuer !== null && issuer.status === "active" && issuer.controlled_accounts.includes(accountId)
  );
}

async function forbid(db: Db, caller: Caller, subject: string, detail: object): Promise<never> {
  await auditAdmin(db, {
    actor: caller.accountId,
    actorKey: caller.publicKey,
    action: "session.issuer.forbidden",
    subject,
    detail: { ...detail },
  });
  throw new AppError(
    "FORBIDDEN",
    403,
    "This account is not a back-office account of the active issuer of this record",
  );
}

/** The issuer a representation belongs to now, from the chain. 404 when the asset is unknown. */
export async function issuerOf(chain: CustodyRepository, representationId: string) {
  const rep = await chain.getRepresentation(representationId);
  if (!rep) throw notFound(`Asset ${representationId}`);
  return rep;
}

/** Throws `FORBIDDEN` (audited) unless `caller` is a back-office account of the representation's issuer. */
export async function requireIssuerAccount(
  db: Db,
  chain: CustodyRepository,
  caller: Caller,
  representationId: string,
  subject: string,
): Promise<void> {
  const rep = await issuerOf(chain, representationId);
  if (!(await controls(chain, rep.issuer_id, caller.accountId)))
    await forbid(db, caller, subject, { representationId, issuerId: rep.issuer_id });
}

/**
 * The representations whose queues `caller` may read: every asset of the issuers it controls,
 * or every asset when `operatorMayRead` and it holds an operator role. `FORBIDDEN` when none.
 * `only` narrows to one asset, which must be among them.
 */
export async function readableRepresentations(
  db: Db,
  chain: CustodyRepository,
  caller: Caller,
  opts: { operatorMayRead: boolean; only?: string | undefined; subject: string },
): Promise<{ issuerIds: string[]; representationIds: string[] }> {
  const issuerRows = await db.select({ id: issuers.id }).from(issuers);
  const operator = opts.operatorMayRead && isOperator(caller.roles);
  const issuerIds: string[] = [];
  for (const { id } of issuerRows) {
    if (operator || (await controls(chain, id, caller.accountId))) issuerIds.push(id);
  }
  if (issuerIds.length === 0) return forbid(db, caller, opts.subject, {});
  const reps = await db
    .select({ id: assetRepresentations.id, issuerId: assetRepresentations.issuerId })
    .from(assetRepresentations);
  const mine = reps.filter((r) => issuerIds.includes(r.issuerId));
  if (opts.only !== undefined) {
    if (!reps.some((r) => r.id === opts.only)) throw notFound(`Asset ${opts.only}`);
    if (!mine.some((r) => r.id === opts.only))
      return forbid(db, caller, opts.subject, { representationId: opts.only });
    return { issuerIds, representationIds: [opts.only] };
  }
  return { issuerIds, representationIds: mine.map((r) => r.id).sort() };
}
