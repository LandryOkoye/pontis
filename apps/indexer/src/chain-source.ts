// What the indexer needs from the chain: the final height and the core contract's executions.

export interface CoreExecution {
  receiptId: string;
  /** Block that executed the receipt. */
  blockHeight: number;
  blockHash: string;
  blockTimestamp: Date;
  /** False when the receipt panicked: its logs are not events, because its state changes were reverted. */
  success: boolean;
  logs: string[];
}

export interface ChainSource {
  /** Height of the latest final block. */
  finalHeight(): Promise<number>;
  /** Executions of receipts delivered to the core contract in block `height` (none for a skipped height). */
  executionsAt(height: number): Promise<CoreExecution[]>;
}
