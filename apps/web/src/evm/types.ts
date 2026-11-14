// What lending needs from an EVM wallet. Two implementations: the browser's injected wallet
// (live, Ethereum Sepolia) and a simulated one (mock mode and tests). Lending positions live on
// Sepolia, so this is separate from the NEAR wallet used for conversions.
import type { LendingTx } from "../lib/lending-types.ts";

/** The user closed or declined the wallet prompt. Nothing was sent. */
export class EvmRejected extends Error {
  constructor() {
    super("You declined the request in your wallet.");
    this.name = "EvmRejected";
  }
}

export interface EvmAdapter {
  readonly kind: "mock" | "injected";
  /** False when the browser has no EVM wallet extension. */
  available(): boolean;
  /** The already-authorised account, if any. Never opens a prompt. */
  account(): Promise<string | null>;
  connect(): Promise<string | null>;
  disconnect(): Promise<void>;
  /** Simulates the call, asks the wallet to sign and send it, and resolves with its hash. */
  send(from: string, tx: LendingTx): Promise<string>;
  /** Resolves once the transaction is mined successfully; rejects if it reverted. */
  confirm(hash: string): Promise<void>;
  decimals(token: string): Promise<number>;
  balanceOf(token: string, owner: string): Promise<bigint>;
  onAccountChange(listener: (account: string | null) => void): () => void;
}
