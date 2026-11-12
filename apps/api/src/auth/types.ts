// What the sign-in code needs from the outside world, so tests can fake the chain and the clock.

import type { AuthKeyType, RoleName } from "@pontis/api-types";
import type { RpcClient } from "@pontis/near-client";

export type KeyType = AuthKeyType;

/** The two chain reads behind sign-in and role checks. */
export interface AuthChain {
  /** The key's type, or null if the account has no such access key. */
  getAccessKey(accountId: string, publicKey: string): Promise<{ type: KeyType } | null>;
  /** Role names as `pontis-core.get_account_roles` returns them. */
  getAccountRoles(accountId: string): Promise<string[]>;
}

export interface AuthDeps {
  chain: AuthChain;
  /** The NEP-413 `recipient`: who the wallet is told the signature is for. */
  recipient: string;
  /** Named in the message so a signature for one network is not a sign-in for another. */
  networkId: string;
  now?: () => Date;
}

export const NONCE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 15 * 60_000;
export const SESSION_MAX_MS = 8 * 60 * 60_000;
export const ROLES_CACHE_MS = 60_000;

/** The caller of an authenticated request. */
export type Principal =
  | { kind: "legacy-key" }
  | {
      kind: "session";
      accountId: string;
      publicKey: string;
      roles: RoleName[];
      expiresAt: Date;
    };

/** Reads access keys over RPC and roles from the core contract. */
export function rpcAuthChain(
  rpc: Pick<RpcClient, "viewAccessKey">,
  core: { getAccountRoles(accountId: string): Promise<string[]> },
): AuthChain {
  return {
    getAccessKey: (accountId, publicKey) => rpc.viewAccessKey(accountId, publicKey),
    getAccountRoles: (accountId) => core.getAccountRoles(accountId),
  };
}
