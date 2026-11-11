// Rich catalogue relationships: approved parity pairs with guards, pairs left proposed, one
// rejected pair and two ECONOMICALLY_SIMILAR pairs between different claims. Ratios are never
// written here: the plan derives each from the two unit multipliers, as the contract checks
// (ADR 0001). Approval is by the project operator, self-reviewed: no outside reviewer exists.

import { richRelationship, type RichRelationship, type RichTier } from "./catalogue-rich-types.ts";
import type { GuardPreset } from "./catalogue.ts";

const SELF_REVIEWED = "self-reviewed by the project team";

/** An approved DIRECT_EQUIVALENT pair of two wrappers of one claim, with a guard. */
const approved = (
  tier: RichTier,
  claimId: string,
  a: string,
  b: string,
  guard: GuardPreset,
  after = "",
) =>
  richRelationship({
    a,
    b,
    claimId,
    tier,
    guard,
    approve: true,
    rationale: `Both are test representations of ${claimId.toUpperCase()}; ratio derived from unit multipliers.`,
    outcome: `Approved for the demo catalogue while both issuers were active; ${SELF_REVIEWED}.${after}`,
  });

export const RICH_RELATIONSHIPS: readonly RichRelationship[] = [
  approved("demo", "syn-tbill-3m", "ttb3m-m", "ttb3m-e", "fund"),
  approved("demo", "syn-mmf-usd", "tmmfusd-m", "tmmfusd-e", "fund"),
  approved("demo", "syn-igcorp", "tigc-c", "tigc-r", "fund"),
  approved("demo", "syn-gold-kg", "tgkg-a", "tgkg-d", "commodity"),
  approved("demo", "syn-idx-global", "tidxg-c", "tidxg-p", "equity"),
  approved("demo", "syn-eur", "teur-m", "teur-e", "stable"),
  approved("demo", "syn-carbon-nature", "tcbn-v", "tcbn-d", "commodity"),
  approved(
    "full",
    "syn-silver-oz",
    "tsil-a",
    "tsil-w",
    "commodity",
    " The issuer was deprecated later.",
  ),
  approved("full", "syn-oil-bbl", "toil-d", "toil-a", "commodity"),
  approved(
    "full",
    "syn-copper-t",
    "tcu-d",
    "tcu-w",
    "commodity",
    " The issuer was deprecated later.",
  ),
  approved(
    "full",
    "syn-cre-logistics",
    "tcrel-r",
    "tcrel-t",
    "illiquid",
    " The issuer was restricted later.",
  ),
  approved("full", "syn-jpy", "tjpy-s", "tjpy-m", "stable"),
  approved("full", "syn-credit", "tcredit-1", "tcredit-b", "illiquid"),
  approved("full", "syn-usd", "tusd-h", "tusd-s", "stable"),
  richRelationship({
    a: "tmmfeur-e",
    b: "tmmfeur-c",
    claimId: "syn-mmf-eur",
    tier: "full",
    approve: false,
    review: "reject",
    rationale: "Both are test representations of SYN-MMF-EUR; ratio derived from unit multipliers.",
    outcome:
      "Rejected: in the story the reviewer found that tmmfeur-c's evidence does not state its fee schedule. A rejected pair can be proposed again.",
  }),
  richRelationship({
    a: "tqfb-p",
    b: "tqfb-o",
    claimId: "syn-stock-quillfeather",
    tier: "full",
    approve: false,
    rationale:
      "Both are test representations of SYN-STOCK-QUILLFEATHER; ratio derived from unit multipliers.",
    outcome:
      "Not approved: tqfb-o cannot be activated while peninsula-orient-assets is restricted.",
  }),
  richRelationship({
    a: "tbskt-c",
    b: "tbskt-o",
    claimId: "syn-basket-tech",
    tier: "full",
    approve: false,
    rationale:
      "Both are test representations of SYN-BASKET-TECH; ratio derived from unit multipliers.",
    outcome:
      "Not approved: tbskt-o cannot be activated while peninsula-orient-assets is restricted.",
  }),
  richRelationship({
    a: "tpef-c",
    b: "tpef-t",
    claimId: "syn-pe-fund",
    tier: "full",
    approve: false,
    rationale: "Both are test representations of SYN-PE-FUND; ratio derived from unit multipliers.",
    outcome:
      "Left proposed: the story's reviewer is waiting for the feeder's evidence. Nothing approves it.",
  }),
  richRelationship({
    a: "tlad-e",
    b: "ttb3m-e",
    claimId: "syn-tbill-ladder",
    tier: "full",
    approve: false,
    classification: "ECONOMICALLY_SIMILAR",
    scope: "Reference only: two different treasury funds. No conversion is offered.",
    rationale:
      "A ladder fund and a three-month fund hold similar bills; they are different claims, so the relationship is informational and the ratio is the multiplier quotient, not a price.",
    outcome: "Left proposed: ECONOMICALLY_SIMILAR never enables conversion.",
  }),
  richRelationship({
    a: "tmmfusd-m",
    b: "ttb3m-m",
    claimId: "syn-mmf-usd",
    tier: "demo",
    approve: false,
    classification: "ECONOMICALLY_SIMILAR",
    scope: "Reference only: a money-market fund and a treasury fund. No conversion is offered.",
    rationale:
      "Both are short-dated dollar funds with a NAV near 1 USD; they are different claims, so the relationship is informational and the ratio is the multiplier quotient, not a price.",
    outcome: "Left proposed: ECONOMICALLY_SIMILAR never enables conversion.",
  }),
];
