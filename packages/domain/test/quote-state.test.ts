import { describe, expect, it } from "vitest";
import {
  QUOTE_STATES,
  allowedQuoteTransitions,
  canTransitionQuote,
  isTerminalQuoteState,
  type QuoteState,
} from "../src/index.ts";

describe("quote state machine (brief §7.4)", () => {
  it("allows the happy path QUOTED -> ACCEPTED -> SUBMITTED -> SETTLED", () => {
    const path: QuoteState[] = ["QUOTED", "ACCEPTED", "SUBMITTED", "SETTLED"];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionQuote(path[i] as QuoteState, path[i + 1] as QuoteState)).toBe(true);
    }
  });

  it("never leaves a terminal state", () => {
    for (const state of ["SETTLED", "REJECTED", "CANCELLED", "FAILED"] as const) {
      expect(isTerminalQuoteState(state)).toBe(true);
      for (const to of QUOTE_STATES) expect(canTransitionQuote(state, to)).toBe(false);
    }
  });

  it("cannot skip ACCEPTED or settle before submission", () => {
    expect(canTransitionQuote("QUOTED", "SUBMITTED")).toBe(false);
    expect(canTransitionQuote("QUOTED", "SETTLED")).toBe(false);
    expect(canTransitionQuote("ACCEPTED", "SETTLED")).toBe(false);
  });

  it("lets a stuck submission resolve either way after reconciliation", () => {
    expect(allowedQuoteTransitions("SUBMITTED")).toContain("REQUIRES_RECONCILIATION");
    expect(allowedQuoteTransitions("REQUIRES_RECONCILIATION")).toEqual(["SETTLED", "FAILED"]);
  });

  it("sends a quote the chain executed behind our back to reconciliation, from any open or expired state", () => {
    for (const from of ["QUOTED", "EXPIRED"] as const) {
      expect(canTransitionQuote(from, "REQUIRES_RECONCILIATION")).toBe(true);
      expect(canTransitionQuote(from, "SETTLED")).toBe(false);
    }
    expect(allowedQuoteTransitions("EXPIRED")).toEqual(["REQUIRES_RECONCILIATION"]);
  });

  it("only transitions to known states and never to itself", () => {
    for (const from of QUOTE_STATES) {
      for (const to of allowedQuoteTransitions(from)) {
        expect(QUOTE_STATES).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });
});
