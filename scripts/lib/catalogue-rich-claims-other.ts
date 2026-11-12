// Rich catalogue claims, part 3: private-credit notes, single shares and stable-value tokens.
// Every claim is fiction; see catalogue-rich-types.ts. Share and note names are invented and no
// company, borrower or ticker is real.

import { RICH_CATEGORY as C } from "./catalogue-rich-issuers.ts";
import { richClaim, type RichClaim } from "./catalogue-rich-types.ts";

const CREDIT = "Synthetic private-credit note (test only)";
const EQUITY = "Synthetic tokenized equity (test only)";
const NO_BORROWER = "None. There is no borrower, loan agreement, security or trustee.";
const NO_COMPANY = "None. There is no company, share register or custodian behind it.";
const NO_RESERVE = "None. There is no reserve, issuer obligation or bank account.";

export const RICH_OTHER_CLAIMS: readonly RichClaim[] = [
  richClaim({
    id: "syn-note-sme",
    tier: "demo",
    name: "Synthetic SME Loan Note 2027",
    category: CREDIT,
    what: "one fictional senior note of 100 USD nominal issued against a fictional pool of small-business loans",
    unit: "1 fictional note of 100 USD nominal",
    denomination: "USD, as a simulated NAV only",
    rights: "None. The claim confers no payment rights.",
    valuation: "Simulated NAV accruing about 9.4% a year toward maturity; not a valuation.",
    redemption:
      "Narrative only: maturity 2027-06-30, redemption at nominal plus accrued interest. Not implemented anywhere.",
    legal: NO_BORROWER,
    risks: [
      "Maturity and redemption terms are text: no contract pays out or burns anything at maturity.",
      "A real loan pool carries default and prepayment risk that is not modelled.",
    ],
    lifecycle:
      "Term instrument with maturity 2027-06-30 in the fiction. The NAV is a simulator output, no strike is published and nothing happens on the maturity date.",
    story: "A term note from a Canadian lender, the longest-dated instrument in the catalogue.",
    jurisdiction: "Canada",
  }),
  richClaim({
    id: "syn-note-trade",
    tier: "full",
    name: "Synthetic Trade-Receivables Note 2026-12 (redemption-gated)",
    category: CREDIT,
    what: "one fictional note of 100 USD nominal backed, in the story, by fictional trade invoices",
    unit: "1 fictional note of 100 USD nominal",
    denomination: "USD, as a simulated NAV only",
    rights: "None. The claim confers no payment rights.",
    valuation: "Simulated NAV accruing about 6.2% a year toward maturity; not a valuation.",
    redemption:
      "Narrative only: maturity 2026-12-18; redemption opens only after maturity and only if the issuer's liquidity condition holds (a redemption gate). Nothing checks the condition and nothing redeems.",
    legal: NO_BORROWER,
    risks: [
      "The redemption gate is text: no contract opens or closes a window, and no exit exists (phase 4 adds redemption).",
      "A real gated note can leave holders unable to exit for long periods.",
    ],
    lifecycle:
      "Term instrument with maturity 2026-12-18 in the fiction and a redemption gate; the gate is a story, not a mechanism.",
    story:
      "The demo's redemption-gated note: the dossier says holders may not redeem on demand. Phase 4 (custody and redemption) is where a gate could become real.",
    jurisdiction: "Canada",
  }),
  richClaim({
    id: "syn-stock-quillfeather",
    tier: "demo",
    name: "Synthetic Quillfeather Biotech ordinary share",
    category: EQUITY,
    what: "one ordinary share of Quillfeather Biotech, a fictional company",
    unit: "1 fictional Quillfeather Biotech ordinary share",
    valuation:
      "Simulated price near 63.40 USD, about 2.8% a day, with a -7% step on 2026-10-14 (a trial readout in the story).",
    legal: NO_COMPANY,
    risks: ["A single-share price is far more volatile than a basket; this one is simulated."],
    lifecycle: "Listed share in the fiction; no dividends, no corporate actions.",
    story:
      "A volatile single stock wrapped by a British dealer and by an applicant in Hong Kong whose review is still pending, so the pair is proposed and cannot be approved.",
  }),
  richClaim({
    id: "syn-stock-tarnowski",
    tier: "full",
    name: "Synthetic Tarnowski Grid Utilities ordinary share",
    category: EQUITY,
    what: "one ordinary share of Tarnowski Grid Utilities, a fictional company",
    unit: "1 fictional Tarnowski Grid Utilities ordinary share, before the announced split",
    valuation: "Simulated price near 38.90 USD, about 1.2% a day; it does not include the split.",
    legal: NO_COMPANY,
    risks: [
      "The split is a record in this dossier only: nothing on chain implements it, and nothing will change on the effective date.",
    ],
    lifecycle: "Listed share in the fiction with a split scheduled but not applied.",
    corporateAction:
      "A 3-for-1 stock split was announced on 2026-11-02 for 2026-12-01. It is recorded here only. No corporate action exists on chain for this claim, so no multiplier changes and no freeze window opens; an operator could propose one with `actions propose` (ADR 0017), which this seed does not.",
    story:
      "A defensive utility share with a split on the calendar, the one the dossier-only action describes.",
  }),
  richClaim({
    id: "syn-stock-marlowe",
    tier: "full",
    name: "Synthetic Marlowe & Finch Retail ordinary share (delisted)",
    category: EQUITY,
    what: "one ordinary share of Marlowe & Finch Retail, a fictional company that was delisted",
    unit: "1 fictional Marlowe & Finch Retail ordinary share",
    valuation:
      "Simulated price near 14.25 USD with a +34% step on 2026-09-03 (a takeover offer in the story). The series is not stopped on the delisting date.",
    legal: NO_COMPANY,
    risks: [
      "The wrapper was deprecated after the story's delisting; the simulated price keeps moving, which a real delisted share would not.",
    ],
    lifecycle:
      "Delisted on 2026-10-14 in the fiction after a takeover. The on-chain effect is one registrar action: the wrapper was moved to deprecated, which is terminal. The two-step delisting of ADR 0018 (request and approve by different accounts) is not used because the seed has one account.",
    story:
      "The demo's delisted asset: the claim stays registered and its only wrapper is deprecated.",
  }),
  richClaim({
    id: "syn-eur",
    tier: "demo",
    name: "Synthetic Euro",
    category: C.stable,
    what: "one euro",
    unit: "1 fictional euro",
    denomination: "EUR, shown in USD at a simulated 1.085 only",
    legal: NO_RESERVE,
    valuation: "Simulated price reverting to 1.085 USD; a peg in the fiction only.",
    risks: ["Nothing backs the peg; a real stable-value token has reserve and issuer risk."],
    lifecycle: "Stable-value token; no strike, no maturity.",
    story:
      "A euro stable-value token wrapped by Singapore and Irish issuers; the tightest guard of any pair.",
  }),
  richClaim({
    id: "syn-jpy",
    tier: "full",
    name: "Synthetic Yen",
    category: C.stable,
    what: "one yen",
    unit: "1 fictional yen",
    denomination: "JPY, shown in USD at a simulated 0.0066 per yen only",
    legal: NO_RESERVE,
    valuation: "Simulated price reverting to 0.0066 USD per yen; a peg in the fiction only.",
    risks: [
      "Nothing backs the peg. Eight-decimal prices make a yen token's price coarse in the simulator.",
    ],
    lifecycle: "Stable-value token; no strike, no maturity.",
    story:
      "A yen stable-value token in two wrappers: one token is one yen, the other is one hundred yen. One issuer is unverified.",
  }),
];
