import { describe, expect, it } from "vitest";
import {
  BRIDGE_TRANSFER_STATES,
  allowedBridgeTransitions,
  bridgeSupplyWithinTolerance,
  canTransitionBridge,
  isBridgeOutcome,
  isTerminalBridgeState,
  type BridgeTransferState,
} from "../src/index.ts";

describe("bridge transfer state machine (expansion brief §8.3)", () => {
  it("allows lock-and-mint and burn-and-mint happy paths", () => {
    const paths: BridgeTransferState[][] = [
      ["INITIATED", "SOURCE_LOCKED", "ATTESTED", "DEST_EXECUTED", "COMPLETED"],
      ["INITIATED", "SOURCE_BURNED", "ATTESTED", "DEST_EXECUTED", "COMPLETED"],
    ];
    for (const path of paths) {
      for (let i = 0; i < path.length - 1; i++) {
        expect(canTransitionBridge(path[i]!, path[i + 1]!)).toBe(true);
      }
    }
  });

  it("allows rejection before source funds are committed and a deterministic refund path after", () => {
    expect(canTransitionBridge("INITIATED", "REJECTED")).toBe(true);
    expect(canTransitionBridge("INITIATED", "REFUNDED")).toBe(false);
    expect(canTransitionBridge("SOURCE_LOCKED", "DEST_FAILED")).toBe(true);
    expect(canTransitionBridge("DEST_FAILED", "REFUND_PENDING")).toBe(true);
    expect(canTransitionBridge("REFUND_PENDING", "REFUNDED")).toBe(true);
  });

  it("routes ambiguous outcomes through reconciliation and resolves to completed or refunded", () => {
    expect(canTransitionBridge("SOURCE_BURNED", "REQUIRES_RECONCILIATION")).toBe(true);
    expect(allowedBridgeTransitions("REQUIRES_RECONCILIATION")).toEqual(["COMPLETED", "REFUNDED"]);
    expect(isBridgeOutcome("COMPLETED")).toBe(true);
    expect(isBridgeOutcome("REFUNDED")).toBe(true);
    expect(isBridgeOutcome("REJECTED")).toBe(true);
    expect(isBridgeOutcome("REQUIRES_RECONCILIATION")).toBe(false);
  });

  it("has no skipped source or destination steps and no terminal-state exits", () => {
    expect(canTransitionBridge("INITIATED", "ATTESTED")).toBe(false);
    expect(canTransitionBridge("ATTESTED", "COMPLETED")).toBe(false);
    for (const state of BRIDGE_TRANSFER_STATES) {
      for (const next of allowedBridgeTransitions(state)) {
        expect(BRIDGE_TRANSFER_STATES).toContain(next);
        expect(next).not.toBe(state);
      }
      if (isTerminalBridgeState(state)) {
        for (const next of BRIDGE_TRANSFER_STATES)
          expect(canTransitionBridge(state, next)).toBe(false);
      }
    }
  });
});

describe("bridge supply invariant monitor", () => {
  it("accepts matching supply and configured in-flight deltas", () => {
    expect(
      bridgeSupplyWithinTolerance({
        sourceLockedOrBurned: 1_000n,
        destinationMinted: 1_000n,
        inFlightTolerance: 0n,
      }),
    ).toBe(true);
    expect(
      bridgeSupplyWithinTolerance({
        sourceLockedOrBurned: 1_010n,
        destinationMinted: 1_000n,
        inFlightTolerance: 10n,
      }),
    ).toBe(true);
  });

  it("flags excess destination minting, out-of-bound deltas and invalid negatives", () => {
    expect(
      bridgeSupplyWithinTolerance({
        sourceLockedOrBurned: 1_000n,
        destinationMinted: 1_011n,
        inFlightTolerance: 10n,
      }),
    ).toBe(false);
    expect(
      bridgeSupplyWithinTolerance({
        sourceLockedOrBurned: -1n,
        destinationMinted: 0n,
        inFlightTolerance: 0n,
      }),
    ).toBe(false);
  });
});
