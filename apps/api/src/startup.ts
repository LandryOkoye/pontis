// Startup check shared by main: refuse to run against an RPC node that serves another chain.

import { assertNetwork, type RpcClient } from "@pontis/near-client";
import type { Config } from "./config.ts";

/**
 * Throws (`NetworkMismatchError` or `NetworkCheckError`) unless the node behind `rpc` serves
 * `config.NEAR_NETWORK_ID`; logs the verified network, chain id and redacted URL otherwise.
 */
export async function verifyStartup(
  config: Pick<Config, "NEAR_NETWORK_ID">,
  rpc: RpcClient,
  info: (message: string, fields: Record<string, unknown>) => void,
): Promise<void> {
  const verified = await assertNetwork(rpc, config.NEAR_NETWORK_ID);
  info("network verified", {
    networkId: verified.networkId,
    chainId: verified.chainId,
    rpc: verified.rpcUrl,
  });
}
