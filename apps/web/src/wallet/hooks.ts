// Chain reads and the faucet call for the connected account.
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssetSummary, WalletAction } from "@pontis/api-types";
import { useWallet } from "./context.tsx";

interface FaucetConfig {
  enabled: boolean;
  max_per_call: string;
  cooldown_ms: number;
}

export interface TokenBalance {
  asset: AssetSummary;
  /** Smallest units, or null while loading or when the read failed. */
  balance: string | null;
  loading: boolean;
  error: boolean;
}

/** `ft_balance_of` for each asset, read from the token contracts. */
export function useTokenBalances(assets: readonly AssetSummary[] | undefined): TokenBalance[] {
  const { accountId, view } = useWallet();
  const results = useQueries({
    queries: (assets ?? []).map((asset) => ({
      queryKey: ["balance", accountId, asset.id],
      queryFn: () => view<string>(asset.accountId, "ft_balance_of", { account_id: accountId }),
      enabled: !!accountId,
      refetchInterval: 6_000,
    })),
  });
  return (assets ?? []).map((asset, i) => ({
    asset,
    balance: accountId ? (results[i]?.data ?? null) : null,
    loading: !!accountId && !!results[i]?.isLoading,
    error: !!results[i]?.isError,
  }));
}

export interface FaucetState {
  config: FaucetConfig;
  /** Epoch ms when the account may mint again; 0 when it never minted. */
  nextAvailableMs: number;
  registered: boolean;
}

export function useFaucetState(asset: AssetSummary | undefined) {
  const { accountId, view } = useWallet();
  return useQuery({
    queryKey: ["faucet", accountId, asset?.id],
    enabled: !!accountId && !!asset,
    refetchInterval: 15_000,
    queryFn: async (): Promise<FaucetState> => {
      const token = (asset as AssetSummary).accountId;
      const args = { account_id: accountId };
      const [faucet, next, storage] = await Promise.all([
        view<FaucetConfig>(token, "faucet_config", {}),
        view<number>(token, "faucet_next_available_ms", args),
        view<unknown>(token, "storage_balance_of", args),
      ]);
      return { config: faucet, nextAvailableMs: Number(next), registered: storage !== null };
    },
  });
}

/** Mints test tokens to the connected account, registering it on the token first if needed. */
export function useFaucetMint(asset: AssetSummary | undefined) {
  const { accountId, send } = useWallet();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: string; registered: boolean }) => {
      if (!asset || !accountId) throw new Error("Connect a wallet first.");
      const actions: WalletAction[] = [];
      if (!input.registered) {
        actions.push({
          receiverId: asset.accountId,
          methodName: "storage_deposit",
          args: { account_id: accountId, registration_only: true },
          gas: "30000000000000",
          deposit: "10000000000000000000000",
        });
      }
      actions.push({
        receiverId: asset.accountId,
        methodName: "faucet_mint",
        args: { amount: input.amount },
        gas: "30000000000000",
        deposit: "0",
      });
      return send(actions, { kind: "faucet" });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["balance"] });
      void client.invalidateQueries({ queryKey: ["faucet"] });
    },
  });
}
