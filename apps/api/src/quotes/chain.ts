import type { ChainPrice, ChainRouteGuards, ChainRouteView } from "@pontis/near-client";

/** What quoting reads from the chain; `CoreClient` implements it and tests supply fakes. */
export interface QuoteChain {
  getRoute(fromId: string, toId: string): Promise<ChainRouteView>;
  /** The guard breakdown and, for an amount, the fee the contract will charge. */
  getRouteGuards(fromId: string, toId: string, amountIn?: string): Promise<ChainRouteGuards>;
  getPrice(representationId: string): Promise<ChainPrice | null>;
  isAllowed(representationId: string, account: string): Promise<boolean>;
  getInventory(representationId: string): Promise<string>;
  getFeeBps(): Promise<number>;
}
