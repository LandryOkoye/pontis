// Network identity: the one place that decides whether an RPC node serves the configured network.

import type { RpcClient } from "./rpc.ts";

/** Why an RPC node's chain does not match `NEAR_NETWORK_ID`, or `undefined` if it does. */
export function networkProblem(networkId: string, chainId: string): string | undefined {
  const matches =
    networkId === "sandbox" ? chainId.startsWith("test-chain") : chainId === networkId;
  if (matches) return undefined;
  return `NEAR_NETWORK_ID is ${networkId} but the RPC node serves the chain "${chainId}". Refusing to send anything: check NEAR_RPC_URL (this project is testnet and sandbox only).`;
}

/**
 * An RPC URL that is safe to print: scheme, host and port only. Userinfo, path and query are
 * dropped because providers put API keys in any of them.
 */
export function redactRpcUrl(url: string): string {
  return URL.canParse(url) ? new URL(url).origin : "<invalid URL>";
}

/** The node serves another chain than the configured network. */
export class NetworkMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkMismatchError";
  }
}

/** The node could not tell which chain it serves (unreachable, bad answer, no chain id). */
export class NetworkCheckError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NetworkCheckError";
  }
}

export interface VerifiedNetwork {
  readonly networkId: string;
  readonly chainId: string;
  /** The RPC URL without userinfo, path or query. */
  readonly rpcUrl: string;
}

/** Asks the node for its `status` and throws unless its chain is the one `expectedNetworkId` names. */
export async function assertNetwork(
  rpc: RpcClient,
  expectedNetworkId: string,
): Promise<VerifiedNetwork> {
  const rpcUrl = redactRpcUrl(rpc.url);
  let status: unknown;
  try {
    status = await rpc.call("status", []);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new NetworkCheckError(
      `Cannot verify the network: the status request to ${rpcUrl} failed (${reason}). Startup refused: check NEAR_RPC_URL.`,
      { cause },
    );
  }
  const chainId = (status as { chain_id?: unknown } | null | undefined)?.chain_id;
  if (typeof chainId !== "string" || chainId === "") {
    throw new NetworkCheckError(
      `Cannot verify the network: ${rpcUrl} answered a status request without a chain id. Startup refused: check NEAR_RPC_URL.`,
    );
  }
  const problem = networkProblem(expectedNetworkId, chainId);
  if (problem) throw new NetworkMismatchError(`${problem} (RPC ${rpcUrl}; startup refused)`);
  return { networkId: expectedNetworkId, chainId, rpcUrl };
}
