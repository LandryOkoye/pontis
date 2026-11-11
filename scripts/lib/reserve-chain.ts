// Chain reads for the simulated custodian and back-office, and the account switch for the commands
// that sign as someone other than the deployer. Views only: nothing here writes. Testnet and
// sandbox only, like every script (`loadConfig` refuses other networks).

import { loadDeployerKey, type ChainConfig } from "./config.ts";
import { connect, type Chain } from "./chain.ts";
import type { ReserveTarget } from "./reserve-publish.ts";

type Env = Record<string, string | undefined>;

/** `Chain.view`, narrowed to what the discovery needs so tests can supply a stub. */
export type View = <T>(
  contractId: string,
  method: string,
  args?: Record<string, unknown>,
) => Promise<T | undefined>;

export interface RepresentationRef {
  id: string;
  /** The token contract account. */
  account_id: string;
  issuer_id: string;
}

interface ReserveStatusView {
  monitored: boolean;
  state: string;
}

interface CustodianView {
  id: string;
  status: string;
  attester_key: string;
}

interface CustodyLinkView {
  custodian_ids: string[];
}

export interface Discovery {
  targets: ReserveTarget[];
  /** Why a representation or custodian is not attested for, one line each, for the log. */
  skipped: string[];
}

/**
 * The (representation, custodian) pairs `attesterKey` may sign for: representations with a reserve
 * policy (monitored) and a custody link, for each linked custodian that is `active` and registered
 * with exactly this key. `onlyCustodian` narrows to one custodian id.
 */
export async function discoverTargets(
  view: View,
  coreId: string,
  representations: readonly RepresentationRef[],
  attesterKey: string,
  onlyCustodian: string | null = null,
): Promise<Discovery> {
  const targets: ReserveTarget[] = [];
  const skipped: string[] = [];
  const custodians = new Map<string, CustodianView | null>();
  const custodian = async (id: string) => {
    if (!custodians.has(id)) {
      const found = await view<CustodianView | null>(coreId, "get_custodian", { id });
      custodians.set(id, found ?? null);
    }
    return custodians.get(id) ?? null;
  };
  for (const rep of representations) {
    const status = await view<ReserveStatusView>(coreId, "get_reserve_status", {
      representation_id: rep.id,
    });
    if (!status?.monitored) {
      skipped.push(`${rep.id}: no reserve policy (unmonitored)`);
      continue;
    }
    const link = await view<CustodyLinkView | null>(coreId, "get_custody_link", {
      representation_id: rep.id,
    });
    if (!link) {
      skipped.push(`${rep.id}: no custody link`);
      continue;
    }
    for (const custodianId of link.custodian_ids) {
      if (onlyCustodian !== null && custodianId !== onlyCustodian) continue;
      const record = await custodian(custodianId);
      if (!record || record.status !== "active") {
        skipped.push(`${rep.id}/${custodianId}: custodian is not active`);
      } else if (record.attester_key !== attesterKey) {
        skipped.push(`${rep.id}/${custodianId}: custodian is registered with another key`);
      } else {
        targets.push({ representationId: rep.id, tokenId: rep.account_id, custodianId });
      }
    }
  }
  return { targets, skipped };
}

/** The real `ft_total_supply` of a token, the number the simulated custodian covers. */
export async function tokenSupply(view: View, tokenId: string): Promise<bigint> {
  const raw = await view<string>(tokenId, "ft_total_supply");
  if (typeof raw !== "string" || !/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`${tokenId}: ft_total_supply returned ${JSON.stringify(raw)}`);
  }
  return BigInt(raw);
}

/**
 * The same network and contracts as `chain`, signing as `accountId` with `secretKey`. A key left
 * empty is read from that account's NEAR credentials file, never from `DEPLOYER_PRIVATE_KEY`.
 */
export function chainAs(
  chain: Chain,
  accountId: string,
  secretKey: string | undefined,
  env: Env = process.env,
): Chain {
  const config: ChainConfig = {
    ...chain.config,
    deployerId: accountId,
    deployerKey:
      secretKey?.trim() ||
      loadDeployerKey(
        { ...env, DEPLOYER_PRIVATE_KEY: undefined },
        chain.config.networkId,
        accountId,
      ),
  };
  return connect(config);
}

/** The account that relays `submit_reserve_attestation`: `RELAYER_ACCOUNT_ID`, else the deployer. */
export function relayerChain(chain: Chain, env: Env = process.env): Chain {
  const id = env.RELAYER_ACCOUNT_ID?.trim();
  return id ? chainAs(chain, id, env.RELAYER_PRIVATE_KEY, env) : chain;
}
