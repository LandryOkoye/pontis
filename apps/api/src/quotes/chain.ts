import type { ChainRouteView } from "@pontis/near-client";

/** What quoting reads from the chain; `CoreClient` implements it and tests supply fakes. */
export interface QuoteChain {
  getRoute(fromId: string, toId: string): Promise<ChainRouteView>;
  isAllowed(representationId: string, account: string): Promise<boolean>;
  getInventory(representationId: string): Promise<string>;
  getFeeBps(): Promise<number>;
}
