// Contract route refusals to API reason codes and plain-language explanations (brief §6.7: the
// product must say why a pair is or is not directly convertible).

import type { RefusalCode } from "@pontis/domain";
import { ROUTE_REFUSALS, type RouteRefusal } from "@pontis/near-client";

/** `NOT_FOUND` when the chain has no such representation even though the mirror does. */
export function refusalCode(refusal: RouteRefusal): RefusalCode | "NOT_FOUND" {
  switch (refusal) {
    case "relationship_suspended":
      return "RELATIONSHIP_SUSPENDED";
    case "asset_paused":
    case "asset_not_active":
      return "ASSET_PAUSED";
    case "asset_not_found":
      return "NOT_FOUND";
    case "price_deviation":
      return "PRICE_DEVIATION";
    case "price_stale":
      return "PRICE_STALE";
    case "price_missing":
    case "price_unavailable":
      return "PRICE_UNAVAILABLE";
    default:
      return "NOT_DIRECT_EQUIVALENT";
  }
}

const EXPLANATIONS: Record<RouteRefusal, string> = {
  asset_not_found: "One of the assets is not registered on-chain.",
  asset_paused: "One of the assets, or the whole protocol, is paused.",
  asset_not_active: "One of the assets, its issuer or its claim is not active.",
  no_relationship:
    "No compatibility relationship has been proposed for this pair, so there is no route.",
  relationship_not_approved: "The compatibility relationship for this pair has not been approved.",
  relationship_suspended:
    "The compatibility relationship was suspended pending review. No conversion can execute.",
  not_direct_equivalent:
    "These assets are not approved as direct equivalents. A matching unit ratio alone never allows a parity conversion.",
  price_deviation:
    "The market price of one asset has moved too far from the approved ratio, so the route is closed until the prices agree again.",
  price_stale:
    "The reference price of one of the assets is older than the pair allows, and the pair is set to close when it cannot be checked.",
  price_missing: "No reference price has been published for one of the assets yet.",
  price_unavailable:
    "The reference prices cannot be compared safely (a value is out of range), so the route is closed.",
};

export const explain = (refusal: RouteRefusal): string => EXPLANATIONS[refusal];

export const PARITY_EXPLANATION =
  "Approved direct equivalents for a narrow, recorded scope: converted at the approved unit ratio from a controlled test vault on the same chain. Settlement is asynchronous with a refund if the payout fails; it is not atomic. Synthetic test assets only.";

/** The refusal a failed line of the guard breakdown stands for (ADR 0016 section 6). */
export function checkRefusal(check: {
  name: string;
  passed: boolean;
  detail: string;
}): RefusalCode | undefined {
  if (check.passed) return undefined;
  switch (check.name) {
    case "route": {
      // The contract prints the refusal's variant name; the route view names it in snake_case.
      const snake = check.detail.replace(
        /[A-Z]/g,
        (c, i) => (i === 0 ? "" : "_") + c.toLowerCase(),
      );
      const refusal = ROUTE_REFUSALS.find((r) => r === snake);
      const code = refusal && refusalCode(refusal);
      return code === "NOT_FOUND" ? undefined : code;
    }
    case "price_freshness":
      return check.detail.includes("no price") ? "PRICE_UNAVAILABLE" : "PRICE_STALE";
    case "circuit_breaker":
      return "RELATIONSHIP_SUSPENDED";
    case "amount_limits":
      return check.detail === "AmountBelowMin"
        ? "AMOUNT_BELOW_MIN"
        : check.detail === "AmountAboveMax"
          ? "AMOUNT_ABOVE_MAX"
          : "WINDOW_LIMIT_EXCEEDED";
    case "vault_inventory":
      return "INSUFFICIENT_INVENTORY";
    default:
      return undefined;
  }
}

const LIMIT_EXPLANATIONS: Partial<Record<RefusalCode, string>> = {
  AMOUNT_BELOW_MIN: "The amount is below the smallest conversion this pair accepts.",
  AMOUNT_ABOVE_MAX: "The amount is above the largest single conversion this pair accepts.",
  WINDOW_LIMIT_EXCEEDED:
    "This pair has reached its conversion limit for the current window. Try again later or with less.",
  RELATIONSHIP_SUSPENDED:
    "The circuit breaker for this pair is open: it closed the route after repeated price disagreement and a second approver must reopen it.",
};

/** Plain-language text for a refusal code that has no `RouteRefusal` of its own. */
export const explainCode = (code: RefusalCode, fallback: string): string =>
  LIMIT_EXPLANATIONS[code] ?? fallback;

const STALE_EXPLANATIONS: Partial<Record<RefusalCode, string>> = {
  PRICE_STALE: EXPLANATIONS.price_stale,
  PRICE_UNAVAILABLE: EXPLANATIONS.price_missing,
};

/**
 * The first reason the guard breakdown refuses an amount, if any. Inventory is left out: quotes
 * and route comparison check it themselves against the exact net payout.
 */
export function guardRefusal(
  checks: readonly { name: string; passed: boolean; detail: string }[],
): { code: RefusalCode; message: string } | undefined {
  for (const check of checks) {
    const code = checkRefusal(check);
    if (!code || code === "INSUFFICIENT_INVENTORY") continue;
    return { code, message: STALE_EXPLANATIONS[code] ?? explainCode(code, check.detail) };
  }
  return undefined;
}
