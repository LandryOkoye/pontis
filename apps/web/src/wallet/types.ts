// What the app needs from a wallet. Two implementations: the NEAR wallet selector (live) and a
// simulated wallet (mock mode and tests). The backend never holds user keys (BuildPlan §2).
import type { WalletAction } from "@pontis/api-types";

export type { WalletAction };

/** The user closed or declined the wallet prompt. Nothing was sent. */
export class WalletRejected extends Error {
  constructor(message = "You declined the request in your wallet.") {
    super(message);
    this.name = "WalletRejected";
  }
}

/**
 * The wallet navigated away to sign (a redirect wallet). The page will reload; the result is
 * picked up from the return URL.
 */
export class WalletRedirected extends Error {
  constructor() {
    super("Continuing in your wallet…");
    this.name = "WalletRedirected";
  }
}

export interface SendResult {
  /** Hash of the last transaction sent, which carries the conversion or the faucet call. */
  txHash: string;
}

export interface WalletAdapter {
  readonly kind: "mock" | "near";
  /** Resolves the signed-in account, if any, once the wallet has loaded. */
  ready(): Promise<string | null>;
  /** Opens the wallet picker. Resolves when the user has signed in or closed it. */
  connect(): Promise<string | null>;
  disconnect(): Promise<void>;
  /**
   * Signs and sends the actions in order, one transaction per distinct receiver.
   * `context` is stored across a redirect so the result can be matched on return.
   */
  send(actions: WalletAction[], context?: PendingContext): Promise<SendResult>;
  /** Read-only contract call. */
  view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T>;
  onAccountChange(listener: (accountId: string | null) => void): () => void;
}

/** What the app was doing when a redirect wallet took over. */
export interface PendingContext {
  kind: "conversion" | "faucet";
  conversionId?: string;
}
