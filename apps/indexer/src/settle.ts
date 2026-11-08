// What a core event means for the quote it names. Pure: the database work is in apply.ts.

import { canTransitionQuote, type QuoteState } from "@pontis/domain";
import type { CoreEvent } from "./events.ts";

export interface QuoteFacts {
  state: QuoteState;
  accountId: string;
  amountIn: string;
  amountOut: string;
}

export interface Settlement {
  to: QuoteState;
  /** Why the conversion failed or needs reconciliation; null when it settled. */
  reason: string | null;
}

/** The nonce an event is about; only conversion events carry one. */
export function nonceOf(event: CoreEvent): string | undefined {
  const nonce = event.data.nonce;
  return typeof nonce === "string" ? nonce : undefined;
}

// An ACCEPTED quote the chain already executed was submitted, even if the wallet has not said so yet.
function reachable(from: QuoteState, to: QuoteState): boolean {
  if (from === "ACCEPTED")
    return canTransitionQuote(from, "SUBMITTED") && canTransitionQuote("SUBMITTED", to);
  return canTransitionQuote(from, to);
}

/** How a `conversion_completed` payload differs from the quote it settles, or `undefined` if it matches. */
export function quoteDisagreement(
  quote: QuoteFacts,
  data: Record<string, unknown>,
): string | undefined {
  const checks: [string, unknown, string][] = [
    ["user", data.user, quote.accountId],
    ["amount_in", data.amount_in, quote.amountIn],
    ["amount_out", data.amount_out, quote.amountOut],
  ];
  const wrong = checks.find(([, onChain, expected]) => onChain !== expected);
  return wrong && `${wrong[0]} on chain (${String(wrong[1])}) differs from the quote (${wrong[2]})`;
}

/** The state a quote should move to because of `event`, or `undefined` to leave it alone. */
export function settlementFor(quote: QuoteFacts, event: CoreEvent): Settlement | undefined {
  // A quote waiting for reconciliation resolves when a matching event finally arrives (a late indexer
  // after the reconciler flagged it as stuck); a disagreeing one stays where it is.
  const open =
    quote.state === "ACCEPTED" ||
    quote.state === "SUBMITTED" ||
    quote.state === "REQUIRES_RECONCILIATION";
  let target: Settlement | undefined;
  switch (event.name) {
    case "conversion_completed": {
      const mismatch = quoteDisagreement(quote, event.data);
      target = mismatch
        ? { to: "REQUIRES_RECONCILIATION", reason: mismatch }
        : { to: "SETTLED", reason: null };
      break;
    }
    case "conversion_failed":
      target = { to: "FAILED", reason: String(event.data.reason) };
      break;
    case "conversion_rejected": {
      // A replayed nonce is refused without touching the original conversion.
      if (event.data.reason === "NONCE_USED") return undefined;
      target = { to: "FAILED", reason: String(event.data.reason) };
      break;
    }
    default:
      return undefined;
  }
  // The chain moved funds, or refused them, for a quote the API never saw submitted: only a
  // refusal is harmless there. Anything else needs a person or the reconciler (B13).
  if (!open) {
    if (event.name === "conversion_rejected") return undefined;
    target = {
      to: "REQUIRES_RECONCILIATION",
      reason: `chain event ${event.name} for a ${quote.state} quote`,
    };
  }
  return reachable(quote.state, target.to) ? target : undefined;
}
