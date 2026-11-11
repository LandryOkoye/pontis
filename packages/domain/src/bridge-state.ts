/**
 * Shared bridge lifecycle from expansion brief §8.3. This models off-chain/API state only; the
 * NEAR and EVM contracts remain authoritative for their respective locks, burns and mints.
 */
export const BRIDGE_TRANSFER_STATES = [
  "INITIATED",
  "SOURCE_LOCKED",
  "SOURCE_BURNED",
  "ATTESTED",
  "DEST_EXECUTED",
  "COMPLETED",
  "REJECTED",
  "DEST_FAILED",
  "REFUND_PENDING",
  "REFUNDED",
  "REQUIRES_RECONCILIATION",
] as const;

export type BridgeTransferState = (typeof BRIDGE_TRANSFER_STATES)[number];

const transitions: Record<BridgeTransferState, readonly BridgeTransferState[]> = {
  INITIATED: ["SOURCE_LOCKED", "SOURCE_BURNED", "REJECTED"],
  SOURCE_LOCKED: ["ATTESTED", "DEST_FAILED", "REQUIRES_RECONCILIATION"],
  SOURCE_BURNED: ["ATTESTED", "DEST_FAILED", "REQUIRES_RECONCILIATION"],
  ATTESTED: ["DEST_EXECUTED", "DEST_FAILED", "REQUIRES_RECONCILIATION"],
  DEST_EXECUTED: ["COMPLETED", "REQUIRES_RECONCILIATION"],
  COMPLETED: [],
  REJECTED: [],
  DEST_FAILED: ["REFUND_PENDING", "REQUIRES_RECONCILIATION"],
  REFUND_PENDING: ["REFUNDED", "REQUIRES_RECONCILIATION"],
  REFUNDED: [],
  REQUIRES_RECONCILIATION: ["COMPLETED", "REFUNDED"],
};

export function allowedBridgeTransitions(
  from: BridgeTransferState,
): readonly BridgeTransferState[] {
  return transitions[from];
}

export function canTransitionBridge(from: BridgeTransferState, to: BridgeTransferState): boolean {
  return transitions[from].includes(to);
}

export function isTerminalBridgeState(state: BridgeTransferState): boolean {
  return transitions[state].length === 0;
}

/** A cross-chain operation must finish in a reconciled terminal outcome. */
export function isBridgeOutcome(state: BridgeTransferState): boolean {
  return state === "COMPLETED" || state === "REFUNDED" || state === "REJECTED";
}

export interface BridgeSupplySnapshot {
  /** Source tokens irrevocably burned or currently locked for the route. */
  readonly sourceLockedOrBurned: bigint;
  /** Destination wrapped tokens minted and not yet burned. */
  readonly destinationMinted: bigint;
  /** Source-denominated value currently in a transition and not yet reflected on both chains. */
  readonly inFlightTolerance: bigint;
}

/** Returns true while the observed aggregate supply difference fits the configured in-flight bound. */
export function bridgeSupplyWithinTolerance(snapshot: BridgeSupplySnapshot): boolean {
  if (
    snapshot.sourceLockedOrBurned < 0n ||
    snapshot.destinationMinted < 0n ||
    snapshot.inFlightTolerance < 0n
  ) {
    return false;
  }
  const delta = snapshot.sourceLockedOrBurned - snapshot.destinationMinted;
  const absoluteDelta = delta < 0n ? -delta : delta;
  return absoluteDelta <= snapshot.inFlightTolerance;
}
