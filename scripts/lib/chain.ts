// Thin wrapper over near-api-js: one deployer account, JSON view and call helpers.

import { Account, JsonRpcProvider, KeyPair } from "near-api-js";
import type { ChainConfig } from "./config.ts";

export const ONE_YOCTO = 1n;
export const MAX_GAS = 300_000_000_000_000n;

export interface Chain {
  readonly config: ChainConfig;
  readonly account: Account;
  view<T>(
    contractId: string,
    method: string,
    args?: Record<string, unknown>,
  ): Promise<T | undefined>;
  /** Signs and sends a function call as the deployer and throws if it failed. */
  call(
    contractId: string,
    method: string,
    args?: Record<string, unknown>,
    options?: { deposit?: bigint; gas?: bigint },
  ): Promise<unknown>;
  exists(accountId: string): Promise<boolean>;
}

export function connect(config: ChainConfig): Chain {
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  const account = new Account(
    config.deployerId,
    provider,
    config.deployerKey as `ed25519:${string}`,
  );
  return {
    config,
    account,
    view: <T>(contractId: string, method: string, args: Record<string, unknown> = {}) =>
      provider.callFunction<T & object>({ contractId, method, args }) as Promise<T | undefined>,
    call: (contractId, method, args = {}, options = {}) =>
      account.callFunction({
        contractId,
        methodName: method,
        args,
        deposit: options.deposit ?? 0n,
        gas: options.gas ?? MAX_GAS,
        waitUntil: "FINAL",
      }),
    exists: async (accountId) => {
      try {
        await provider.viewAccount({ accountId });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Admin methods on pontis-core and the token require exactly 1 yoctoNEAR. */
export function admin(
  chain: Chain,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  return chain.call(contractId, method, args, { deposit: ONE_YOCTO });
}

/** What is wrong with the deployer key, in plain words, or `undefined` if it is a full-access key. */
export function deployerKeyProblem(
  publicKey: string,
  deployerId: string,
  fullAccessKeys: string[],
): string | undefined {
  if (fullAccessKeys.includes(publicKey)) return undefined;
  return `The configured key (${publicKey}) is not a full-access key of ${deployerId}. Its full-access keys are: ${fullAccessKeys.join(", ") || "none"}. Check DEPLOYER_PRIVATE_KEY.`;
}

/** Fails before any transaction if the key cannot sign for the deployer account. */
export async function assertDeployerKey(chain: Chain): Promise<void> {
  const publicKey = KeyPair.fromString(chain.config.deployerKey as `ed25519:${string}`)
    .getPublicKey()
    .toString();
  const { keys } = await chain.account.getAccessKeyList();
  const fullAccess = keys
    .filter((k) => k.access_key.permission === "FullAccess")
    .map((k) => k.public_key);
  const problem = deployerKeyProblem(publicKey, chain.config.deployerId, fullAccess);
  if (problem) throw new Error(problem);
}
