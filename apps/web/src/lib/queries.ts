// TanStack Query hooks, one per API read. Mutations live next to the flow that uses them.
import { useQueries, useQuery } from "@tanstack/react-query";
import { isTerminalQuoteState } from "@pontis/domain";
import { ApiFailure, api } from "./api.ts";
import type { ChartRange } from "./market-types.ts";

export const keys = {
  health: ["health"] as const,
  issuers: ["issuers"] as const,
  issuer: (id: string) => ["issuer", id] as const,
  assets: ["assets"] as const,
  asset: (id: string) => ["asset", id] as const,
  compatibility: (id: string) => ["compatibility", id] as const,
  route: (from: string, to: string) => ["route", from, to] as const,
  transaction: (id: string) => ["transaction", id] as const,
  transactions: (account: string) => ["transactions", account] as const,
};

/** Refusals and 4xx answers are final; only transport and server faults are worth retrying. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiFailure && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const useHealth = () =>
  useQuery({
    queryKey: keys.health,
    queryFn: ({ signal }) => api.health(signal),
    refetchInterval: 10_000,
  });

export const useIssuers = () => useQuery({ queryKey: keys.issuers, queryFn: api.issuers });

export const useIssuer = (id: string | undefined) =>
  useQuery({
    queryKey: keys.issuer(id ?? ""),
    queryFn: () => api.issuer(id as string),
    enabled: !!id,
  });

export const useAssets = () => useQuery({ queryKey: keys.assets, queryFn: api.assets });

export const useAsset = (id: string | undefined) =>
  useQuery({
    queryKey: keys.asset(id ?? ""),
    queryFn: () => api.asset(id as string),
    enabled: !!id,
    refetchInterval: 30_000,
  });

/** Full detail (claim, evidence, vault inventory) for every listed asset. */
export function useAssetDetails(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: keys.asset(id),
      queryFn: () => api.asset(id),
      refetchInterval: 30_000,
    })),
  });
}

export const useCompatibility = (id: string | undefined) =>
  useQuery({
    queryKey: keys.compatibility(id ?? ""),
    queryFn: () => api.compatibility(id as string),
    enabled: !!id,
  });

export const useRoute = (fromId: string | undefined, toId: string | undefined) =>
  useQuery({
    queryKey: keys.route(fromId ?? "", toId ?? ""),
    queryFn: () => api.compareRoutes({ fromId: fromId as string, toId: toId as string }),
    enabled: !!fromId && !!toId,
  });

export const useTransaction = (id: string | undefined) =>
  useQuery({
    queryKey: keys.transaction(id ?? ""),
    queryFn: () => api.transaction(id as string),
    enabled: !!id,
    // Poll until the indexer has moved the conversion to a final state.
    refetchInterval: (query) =>
      query.state.data && isTerminalQuoteState(query.state.data.state) ? false : 2_500,
  });

export const useTransactions = (account: string | null) =>
  useQuery({
    queryKey: keys.transactions(account ?? ""),
    queryFn: () => api.transactions(account as string),
    enabled: !!account,
    refetchInterval: 8_000,
  });

export const useMarketAssets = () =>
  useQuery({ queryKey: ["market", "assets"], queryFn: api.marketAssets, refetchInterval: 60_000 });

export const useMarketAsset = (id: string | undefined) =>
  useQuery({
    queryKey: ["market", "asset", id ?? ""],
    queryFn: () => api.marketAsset(id as string),
    enabled: !!id,
    refetchInterval: 60_000,
  });

export const useMarketChart = (id: string | undefined, range: ChartRange) =>
  useQuery({
    queryKey: ["market", "chart", id ?? "", range],
    queryFn: () => api.marketChart(id as string, range),
    enabled: !!id,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
