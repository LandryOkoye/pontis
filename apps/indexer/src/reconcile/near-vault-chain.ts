import { CoreClient, TokenClient, type RpcClient } from "@pontis/near-client";
import type { ActionChain } from "./actions.ts";
import type { VaultChain } from "./vaults.ts";

/**
 * Reads what the core accounts for from its views and balances from each token's `ft_balance_of`.
 * The accounted amount is spendable inventory plus the input held for in-flight conversions
 * (ADR 0008): both are tokens the core holds. Inventory is read first; a conversion settling
 * between the two reads can only make the sum look smaller, which is a warning, never a false
 * insolvency.
 */
export function nearVaultChain(rpc: RpcClient, coreId: string): VaultChain & ActionChain {
  const core = new CoreClient(rpc, coreId);
  return {
    corporateActions: (assetId) => core.getCorporateActions(assetId),
    inventory: async (representationId) => {
      const spendable = await core.getInventory(representationId);
      const pending = await core.getPendingInbound(representationId);
      return (BigInt(spendable) + BigInt(pending)).toString();
    },
    balanceOf: (tokenAccountId, holder) => new TokenClient(rpc, tokenAccountId).ftBalanceOf(holder),
  };
}
