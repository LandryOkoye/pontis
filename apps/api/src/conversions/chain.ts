/** What accepting a quote reads from the chain; `TokenClient` backs it in the server. */
export interface ConversionChain {
  /** Whether `account` is registered on the token (a payout to an unregistered account fails). */
  isRegistered(tokenId: string, account: string): Promise<boolean>;
}
