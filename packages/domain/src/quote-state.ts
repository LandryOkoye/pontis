// Quote / conversion lifecycle (brief §7.4). `REQUESTED` and `ROUTED` are transient inside a single
// request in the MVP; a persisted quote starts at `QUOTED`. `CANCELLED` exists for later use.

export const QUOTE_STATES = [
  "REQUESTED",
  "ROUTED",
  "QUOTED",
  "ACCEPTED",
  "SUBMITTED",
  "SETTLED",
  "EXPIRED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
  "REQUIRES_RECONCILIATION",
] as const;
export type QuoteState = (typeof QUOTE_STATES)[number];

const TRANSITIONS: Readonly<Record<QuoteState, readonly QuoteState[]>> = {
  REQUESTED: ["ROUTED", "REJECTED"],
  ROUTED: ["QUOTED", "REJECTED"],
  // A quote the chain executed without the API seeing it submitted (never accepted, or already
  // swept as expired) cannot be undone: it goes to reconciliation, not to a silent terminal state.
  QUOTED: ["ACCEPTED", "EXPIRED", "CANCELLED", "REQUIRES_RECONCILIATION"],
  ACCEPTED: ["SUBMITTED", "EXPIRED", "CANCELLED"],
  SUBMITTED: ["SETTLED", "FAILED", "REQUIRES_RECONCILIATION"],
  REQUIRES_RECONCILIATION: ["SETTLED", "FAILED"],
  SETTLED: [],
  EXPIRED: ["REQUIRES_RECONCILIATION"],
  REJECTED: [],
  CANCELLED: [],
  FAILED: [],
};

export function allowedQuoteTransitions(from: QuoteState): readonly QuoteState[] {
  return TRANSITIONS[from];
}

export function canTransitionQuote(from: QuoteState, to: QuoteState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalQuoteState(state: QuoteState): boolean {
  return TRANSITIONS[state].length === 0;
}
