// Rich catalogue claims, part 2: metals, commodities, carbon credits and unique records (art and
// a flat). Every claim is fiction; see catalogue-rich-types.ts. Unique records have a unit supply
// of one and are never convertible, like the phase 1 villa.

import { RICH_CATEGORY as C } from "./catalogue-rich-issuers.ts";
import { richClaim, type RichClaim } from "./catalogue-rich-types.ts";

const NO_VAULT = "None. There is no vault, bar, custodian or warehouse receipt behind it.";
const UNIQUE_RISK = "A supply of one is not enforced against a second record of the same work.";

export const RICH_ASSET_CLAIMS: readonly RichClaim[] = [
  richClaim({
    id: "syn-gold-kg",
    tier: "demo",
    name: "Synthetic Gold, one kilogram bar",
    category: C.metal,
    what: "one kilogram of fictional allocated gold",
    unit: "1 fictional kilogram of fictional gold",
    valuation: "Simulated price near 85,300 USD per kilogram, a random walk of about 1% a day.",
    legal: NO_VAULT,
    risks: ["Parity conversion says nothing about price, bar quality or storage."],
    lifecycle: "Commodity claim; no strike, no maturity, no redemption.",
    story:
      "Gold sold by the kilogram. One wrapper is a whole-bar token and the other is one gram per token with four decimals, so the pair's ratio is 10 to 1 in smallest units.",
    jurisdiction: "Switzerland",
  }),
  richClaim({
    id: "syn-silver-oz",
    tier: "full",
    name: "Synthetic Silver, one troy ounce",
    category: C.metal,
    what: "one troy ounce of fictional allocated silver",
    unit: "1 fictional troy ounce of fictional silver",
    valuation: "Simulated price near 31.40 USD per ounce, a random walk of about 1.9% a day.",
    legal: NO_VAULT,
    risks: ["Silver in the simulator is more volatile than gold; neither says anything real."],
    lifecycle: "Commodity claim; no strike, no maturity, no redemption.",
    story:
      "Silver wrapped by a Swiss house and by an Australian trader. The trader's attestation lapsed and it was deprecated, so the approved pair no longer converts.",
  }),
  richClaim({
    id: "syn-oil-bbl",
    tier: "full",
    name: "Synthetic Crude Oil, one barrel",
    category: C.industrial,
    what: "one barrel of fictional crude oil",
    unit: "1 fictional barrel of fictional crude oil",
    valuation:
      "Simulated price near 78.60 USD per barrel, about 2.2% a day, with a -3% step on 2026-10-08.",
    legal: "None. There is no tank, pipeline, cargo or warehouse receipt behind it.",
    risks: ["There is no delivery: the claim is a price series with a token on it."],
    lifecycle: "Commodity claim; no strike, no maturity, no redemption.",
    story:
      "Oil as a price-only claim, wrapped by an Emirati house and a Swiss house, the most volatile approved pair.",
  }),
  richClaim({
    id: "syn-copper-t",
    tier: "full",
    name: "Synthetic Copper, one tonne",
    category: C.industrial,
    what: "one tonne of fictional refined copper",
    unit: "1 fictional tonne of fictional copper",
    valuation: "Simulated price near 9,450 USD per tonne, a random walk of about 1.4% a day.",
    legal: "None. There is no warehouse, brand or warrant behind it.",
    risks: ["No metal is held; a real warehouse receipt has counterparty and storage risk."],
    lifecycle: "Commodity claim; no strike, no maturity, no redemption.",
    story:
      "Copper wrapped by an Emirati house and an Australian trader whose attestation lapsed; the approved pair is blocked.",
  }),
  richClaim({
    id: "syn-carbon-nature",
    tier: "demo",
    name: "Synthetic Nature-Based Carbon Credit (1 tCO2e)",
    category: C.carbon,
    what: "one tonne of fictional avoided emissions from a fictional forest project",
    unit: "1 fictional tonne of carbon dioxide equivalent",
    valuation: "Simulated price near 24.80 USD, about 2.5% a day, with a +6% step on 2026-09-15.",
    legal: "None. There is no project, registry entry, buffer pool or retirement behind it.",
    risks: [
      "A real credit can be reversed or double counted; nothing here is registered or retired.",
    ],
    lifecycle:
      "Vintage 2025 in the fiction. Retirement is narrative: no token is burned to retire a credit.",
    story:
      "A forest credit from a Brazilian originator, also wrapped by an Emirati trader with three decimals.",
    jurisdiction: "Brazil",
  }),
  richClaim({
    id: "syn-carbon-eng",
    tier: "full",
    name: "Synthetic Engineered Removal Credit (1 tCO2e)",
    category: C.carbon,
    what: "one tonne of fictional engineered carbon removal",
    unit: "1 fictional tonne of carbon dioxide equivalent removed",
    valuation: "Simulated price near 310 USD, a random walk of about 1.2% a day.",
    legal: "None. There is no plant, storage site, registry entry or retirement behind it.",
    risks: ["Nothing was removed; the credit is a label."],
    lifecycle: "Vintage 2026 in the fiction; retirement is narrative only.",
    story:
      "A single wrapper from an issuer that was deprecated after its attestation lapsed: the token stays in the registry and cannot convert.",
  }),
  richClaim({
    id: "syn-art-canvas",
    tier: "demo",
    name: "Synthetic Canvas, Lantern Study No. 4 (unique work)",
    category: C.art,
    what: "one fictional oil-on-canvas work, Lantern Study No. 4 by a fictional painter",
    unit: "the whole fictional painting; the unit supply is 1",
    valuation:
      "Simulated appraisal series near 480,000 USD with one +5.5% step on 2026-10-22 (an auction estimate in the story).",
    legal: "None. There is no deed, provenance record, insurance or custody behind it.",
    redemption: "None. The record cannot be redeemed, sold or fractionalised.",
    risks: [UNIQUE_RISK, "The appraisal is simulated; a real work has no continuous price."],
    lifecycle: "Unique asset: one token with 0 decimals, never convertible, bridge-only.",
    story: "A single indivisible record, like the phase 1 villa, from a Paris collections house.",
    jurisdiction: "France",
  }),
  richClaim({
    id: "syn-resi-flat",
    tier: "full",
    name: "Synthetic Apartment 4B record (unique property)",
    category: C.resi,
    what: "one fictional apartment, flat 4B of a fictional building in Paris",
    unit: "the whole fictional apartment; the unit supply is 1",
    valuation: "Simulated appraisal series near 640,000 USD with one +0.6% step on 2026-09-30.",
    legal: "None. There is no deed, title register, co-ownership or company behind it.",
    redemption: "None. The record cannot be redeemed, sold or fractionalised.",
    risks: [UNIQUE_RISK, "The appraisal is simulated."],
    lifecycle: "Unique asset: one token with 0 decimals, never convertible, bridge-only.",
    story: "Residential real estate as a single record, from the same house as the canvas.",
    jurisdiction: "France",
  }),
];
