import { CoreClient, TokenClient, type RpcClient } from "@pontis/near-client";
import type { VaultChain } from "./vaults.ts";

/** Reads inventory from the core's view and balances from each token's `ft_balance_of`. */
export function nearVaultChain(rpc: RpcClient, coreId: string): VaultChain {
  const core = new CoreClient(rpc, coreId);
  return {
    inventory: (representationId) => core.getInventory(representationId),
    balanceOf: (tokenAccountId, holder) => new TokenClient(rpc, tokenAccountId).ftBalanceOf(holder),
  };
}
