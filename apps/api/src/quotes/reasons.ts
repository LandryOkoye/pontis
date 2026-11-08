// Contract route refusals to API reason codes and plain-language explanations (brief §6.7: the
// product must say why a pair is or is not directly convertible).

import type { RefusalCode } from "@pontis/domain";
import type { RouteRefusal } from "@pontis/near-client";

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
};

export const explain = (refusal: RouteRefusal): string => EXPLANATIONS[refusal];

export const PARITY_EXPLANATION =
  "Approved direct equivalents for a narrow, recorded scope: converted at the approved unit ratio from a controlled test vault, same chain, atomic. Synthetic test assets only.";
