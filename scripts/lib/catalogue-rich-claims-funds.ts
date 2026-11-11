// Rich catalogue claims, part 1: funds and baskets (treasury, money-market, bond, index, private
// funds and property funds). Every claim is fiction; see catalogue-rich-types.ts. The simulated
// figures in each valuation text are the demo numbers in packages/market-data/src/feed/profiles-rich.ts.

import { RICH_CATEGORY as C } from "./catalogue-rich-issuers.ts";
import { richClaim, type RichClaim } from "./catalogue-rich-types.ts";

const FUND = "Synthetic Treasury fund (test only)";
const NO_FUND = "None. There is no fund, manager, custodian or trust behind it.";

export const RICH_FUND_CLAIMS: readonly RichClaim[] = [
  richClaim({
    id: "syn-tbill-3m",
    tier: "demo",
    name: "Synthetic 3-Month Treasury Bill Fund unit",
    category: FUND,
    what: "one unit of a fictional fund that rolls three-month US Treasury bills",
    unit: "1 fictional fund unit with a nominal NAV of 1 USD at the start",
    valuation: "Simulated NAV accruing about 4.3% a year; not a published NAV.",
    redemption: "None. The claim cannot be redeemed at the NAV or at any other price.",
    legal: NO_FUND,
    risks: ["A smoothly rising NAV is a property of the simulator, not evidence of any return."],
    lifecycle:
      "NAV fund with a daily strike at 16:00 UTC in the fiction. No strike is published: the simulator writes a NAV every five minutes and an operator may sign one for the contract (ADR 0018).",
    story:
      "The flagship short-dated treasury fund of the demo, wrapped by two different issuers with different decimals so a parity pair exists.",
  }),
  richClaim({
    id: "syn-tbill-ladder",
    tier: "full",
    name: "Synthetic Treasury Ladder Fund unit (1 to 12 months)",
    category: FUND,
    what: "one unit of a fictional fund holding a ladder of one- to twelve-month bills",
    unit: "1 fictional fund unit with a nominal NAV of 1 USD at the start",
    valuation: "Simulated NAV accruing about 4.1% a year; not a published NAV.",
    legal: NO_FUND,
    risks: ["The ladder is a label: no bill is held and no maturity is tracked."],
    lifecycle: "NAV fund with a daily strike in the fiction; same mechanism as syn-tbill-3m.",
    story:
      "A longer ladder offered next to the three-month fund. The two are only economically similar, so the pair between them stays proposed and cannot convert.",
  }),
  richClaim({
    id: "syn-mmf-usd",
    tier: "demo",
    name: "Synthetic USD Money-Market Fund unit",
    category: C.mmf,
    what: "one unit of a fictional US dollar money-market fund",
    unit: "1 fictional fund unit with a nominal NAV of 1 USD at the start",
    valuation: "Simulated NAV accruing about 4.4% a year; not a published NAV.",
    legal: NO_FUND,
    risks: ["No fund stabilises the NAV; a real money-market fund can break its stable value."],
    lifecycle: "NAV fund with a daily strike in the fiction; one wrapper stands for ten units.",
    story:
      "Two wrappers of one claim where one token is ten fund units, so the approved ratio is not a power of ten of the other's.",
  }),
  richClaim({
    id: "syn-mmf-eur",
    tier: "full",
    name: "Synthetic EUR Money-Market Fund unit",
    category: C.mmf,
    what: "one unit of a fictional euro money-market fund",
    unit: "1 fictional fund unit with a nominal NAV of 1 EUR at the start",
    denomination: "EUR, shown in USD at a simulated 1.085 only",
    valuation: "Simulated NAV accruing about 2.6% a year; not a published NAV.",
    legal: NO_FUND,
    risks: ["The euro rate is fixed in the simulator and says nothing about any exchange rate."],
    lifecycle: "NAV fund with a daily strike in the fiction.",
    story:
      "Two wrappers whose proposed parity pair was rejected: the reviewer in the story found the second issuer's evidence did not state its fee schedule.",
  }),
  richClaim({
    id: "syn-igcorp",
    tier: "demo",
    name: "Synthetic Investment-Grade Corporate Bond Fund unit",
    category: C.igBond,
    what: "one unit of a fictional fund of investment-grade corporate bonds",
    unit: "1 fictional fund unit priced near 100 USD at the start",
    valuation: "Simulated market price, a slow random walk with a little drift; not a NAV.",
    legal: NO_FUND,
    risks: ["Credit and duration risk of a real bond fund are not modelled."],
    lifecycle: "Open-ended fund unit priced by the market in the fiction; no strike.",
    story: "A bond fund wrapped by a Luxembourg and a German issuer; the pair is guarded.",
  }),
  richClaim({
    id: "syn-idx-global",
    tier: "demo",
    name: "Synthetic Global Equity Index Tracker unit",
    category: C.basket,
    what: "one unit of a fictional tracker of a fictional global equity index",
    unit: "1 fictional tracker unit priced near 318 USD at the start",
    valuation: "Simulated price, a random walk of about 16% a year; not an index level.",
    legal: NO_FUND,
    risks: ["The index does not exist; the walk is not correlated with any real market."],
    lifecycle: "Exchange-traded style unit; no strike. Dividends are not modelled.",
    story: "The demo's broad-market tracker, wrapped twice with different units per token.",
  }),
  richClaim({
    id: "syn-basket-tech",
    tier: "full",
    name: "Synthetic Technology Equity Basket unit",
    category: C.basket,
    what: "one unit of a fictional basket of fictional technology shares",
    unit: "1 fictional basket unit priced near 76 USD at the start",
    valuation: "Simulated price, a random walk of about 26% a year; not an index level.",
    legal: NO_FUND,
    risks: ["The basket holds nothing; its constituents are not named."],
    lifecycle: "Rebalanced quarterly in the fiction; nothing implements the rebalance.",
    story:
      "A higher-volatility basket. One wrapper belongs to an issuer whose review is pending, so the pair is proposed and cannot be approved.",
  }),
  richClaim({
    id: "syn-vc-fund",
    tier: "full",
    name: "Synthetic Venture Growth Fund unit",
    category: C.vcpe,
    what: "one unit of a fictional venture growth fund",
    unit: "1 fictional fund unit with a quarterly mark near 1,420 USD at the start",
    valuation:
      "Simulated quarterly mark: almost flat between marks and one +3.1% mark on 2026-09-30.",
    legal: NO_FUND,
    risks: [
      "Real private-fund units are illiquid and marked by the manager; this mark is a simulator step.",
    ],
    lifecycle: "Closed-end style unit with quarterly marks in the fiction; no redemption.",
    story:
      "A fund sponsored by an issuer that was later moved back to restricted, so the token is registered but cannot convert.",
  }),
  richClaim({
    id: "syn-pe-fund",
    tier: "full",
    name: "Synthetic Buyout Fund II unit",
    category: C.vcpe,
    what: "one unit of a fictional buyout fund",
    unit: "1 fictional fund unit with a quarterly mark near 2,015 USD at the start",
    valuation:
      "Simulated quarterly mark: almost flat between marks and one -1.2% mark on 2026-09-30.",
    legal: NO_FUND,
    risks: ["A real buyout fund calls and distributes capital; none of that is modelled."],
    lifecycle: "Closed-end style unit with quarterly marks in the fiction; no redemption.",
    story:
      "Wrapped by the sponsor and by a feeder in another country. The parity pair is only proposed.",
  }),
  richClaim({
    id: "syn-cre-office",
    tier: "demo",
    name: "Synthetic Office Property Fund unit",
    category: C.cre,
    what: "one unit of a fictional fund of fictional office buildings",
    unit: "1 fictional fund unit priced near 96.80 USD at the start",
    valuation:
      "Simulated appraisal-driven price: nearly flat with one -0.8% reappraisal on 2026-09-30.",
    legal: "None. There is no fund, property, deed or trust behind it.",
    risks: [
      "Real property funds are valued by appraisal and gate redemptions; none of that exists.",
    ],
    lifecycle: "Open-ended property fund unit with quarterly appraisals in the fiction.",
    story: "Commercial real estate in a single wrapper, so it has no conversion partner.",
    jurisdiction: "Germany",
  }),
  richClaim({
    id: "syn-cre-logistics",
    tier: "full",
    name: "Synthetic Logistics Property Fund unit",
    category: C.cre,
    what: "one unit of a fictional fund of fictional warehouses",
    unit: "1 fictional fund unit priced near 124.50 USD at the start",
    valuation:
      "Simulated appraisal-driven price: nearly flat with one +1.4% reappraisal on 2026-09-30.",
    legal: "None. There is no fund, property, deed or trust behind it.",
    risks: [
      "Real property funds are valued by appraisal and gate redemptions; none of that exists.",
    ],
    lifecycle: "Open-ended property fund unit with quarterly appraisals in the fiction.",
    story:
      "Wrapped by a German manager and a Cayman sponsor. The pair was approved while the sponsor was active; the sponsor is now restricted, so it does not convert.",
  }),
  richClaim({
    id: "syn-resi-rental",
    tier: "full",
    name: "Synthetic Residential Rental Portfolio unit",
    category: C.resi,
    what: "one unit of a fictional portfolio of rented flats",
    unit: "1 fictional portfolio unit priced near 58 USD at the start",
    valuation:
      "Simulated appraisal-driven price: nearly flat with one +0.9% reappraisal on 2026-09-30.",
    legal: "None. There is no portfolio, tenancy, deed or trust behind it.",
    risks: ["Rent is not modelled: the unit pays nothing."],
    lifecycle: "Open-ended unit with quarterly appraisals in the fiction.",
    story:
      "Residential real estate as a fund unit: divisible, in contrast to the single-flat record.",
    jurisdiction: "Germany",
  }),
];
