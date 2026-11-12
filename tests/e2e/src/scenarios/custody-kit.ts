// What the custody scenarios share: the one representation they act on, plain readings of the
// chain and of the indexer's mirror, and the reconciler's latest report. Everything they set up is
// SIMULATED (ADR 0020): a fictional custodian and issuer back-office holding public dev keys.

import { ENDPOINTS, type ReconciliationReport } from "@pontis/api-types";
import type { Chain } from "../../../../scripts/lib/chain.ts";
import { parse, type Reply } from "../api.ts";
import { waitFor } from "../processes.ts";
import type { User } from "../wallet.ts";
import type { World } from "../world.ts";

export const REP = "tgold-a";
export const ISSUER = "synthetic-issuer-a";
export const CUSTODIAN = "vault-co-sim";
/** The role holder the dev reserve-attester key is tied to. It never signs a transaction. */
export const ATTESTER_ACCOUNT = "custodian-sim";

export const reserves = async (world: World) =>
  parse(await world.api.get(`/v1/assets/${REP}/reserves`), ENDPOINTS.getAssetReserves.response);

/** Rows of the indexer's mirror; the u128 columns come back as strings. */
export async function mirror<T extends object>(
  world: World,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await world.pool.query(sql, params)).rows as T[];
}

export const view = async <T>(
  world: World,
  contract: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> => {
  const value = await world.chain.view<T>(contract, method, args);
  if (value === undefined || value === null)
    throw new Error(`${contract}.${method} returned nothing`);
  return value;
};

/** True if `run` throws: a host panic is a wasm trap, so callers assert state, not the message. */
export async function refused(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
}

/** The first reconciler report whose run began after now. */
export async function freshReconciliation(world: World): Promise<ReconciliationReport> {
  const since = Date.now();
  return waitFor(
    "a reconciler run that started after this step",
    async () => {
      const r = parse(await world.api.admin(), ENDPOINTS.getReconciliation.response);
      return r.ranAt !== null && Date.parse(r.ranAt) >= since && r;
    },
    { timeoutMs: 60_000 },
  );
}

/** What the core holds of `REP` beyond what its books account for (the earlier untracked transfer). */
export function untracked(run: ReconciliationReport): bigint {
  const vault = run.vaults.find((v) => v.representationId === REP);
  if (!vault) throw new Error(`no vault reading for ${REP}`);
  return BigInt(vault.balance) - BigInt(vault.inventory);
}

/** What the later steps need from the earlier ones. */
export interface CustodyKit {
  user: User;
  /** Signs as the issuer's account (a `controlled_accounts` entry); see the runbook. */
  office: Chain;
  /** `scripts reserves <argv>` as the operator would run it. */
  command(...argv: string[]): Promise<void>;
  /** One simulated custodian round, at the drift state's cover or else `coverBps`. */
  publish(coverBps?: number): Promise<void>;
  /** A quote request for the guarded pair from `user`. */
  quote(): Promise<Reply>;
}
