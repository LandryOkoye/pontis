// The invented issuers of the rich demo catalogue (ADR 0019 section 3), fifteen in fifteen
// jurisdictions. None names or imitates a real firm: each name is a made-up compound, each domain
// is under the reserved `.example` suffix, and the jurisdiction and regulator category are real
// places and categories used as plain facts. No issuer is supervised, licensed or verified by
// anyone: the trust states below are statuses a registrar set, and `issuer_attested` means only
// that the issuer's own dossier is on file (ADR 0009).

import { richIssuer, type RichIssuer } from "./catalogue-rich-types.ts";

/** Categories of the rich catalogue; every claim's category appears in some issuer's list. */
export const RICH_CATEGORY = {
  mmf: "Synthetic money-market fund (test only)",
  igBond: "Synthetic investment-grade bond fund (test only)",
  metal: "Synthetic precious-metal claim (test only)",
  industrial: "Synthetic industrial commodity claim (test only)",
  cre: "Synthetic commercial real-estate fund (test only)",
  resi: "Synthetic residential real estate (test only)",
  basket: "Synthetic equity basket or index tracker (test only)",
  stable: "Synthetic stable-value token (test only)",
  carbon: "Synthetic carbon credit (test only)",
  vcpe: "Synthetic venture or private-equity fund (test only)",
  art: "Synthetic art or collectible (test only)",
} as const;

// Categories shared with the phase 1 catalogue, spelled the same (scripts/lib/catalogue.ts).
const FUND = "Synthetic Treasury fund (test only)";
const EQUITY = "Synthetic tokenized equity (test only)";
const CREDIT = "Synthetic private-credit note (test only)";
const DOLLAR = "Synthetic dollar-pegged quote asset (test only)";
const C = RICH_CATEGORY;

export const RICH_ISSUERS: readonly RichIssuer[] = [
  richIssuer({
    id: "alpenrose-fiduciary",
    name: "Alpenrose Fiduciary",
    tier: "demo",
    jurisdiction: "Switzerland",
    kind: "Precious-metals custodian and asset manager, a category supervised in Switzerland",
    categories: [C.metal, C.industrial],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional Zurich vault-and-fund house that tokenises bars and barrels. Fully set up: active, with its own dossier on file. The vault it describes does not exist.",
  }),
  richIssuer({
    id: "merlion-harbour-trust",
    name: "Merlion Harbour Trust",
    tier: "demo",
    jurisdiction: "Singapore",
    kind: "Fund manager with a capital-markets services licence category in Singapore",
    categories: [FUND, C.mmf, C.stable],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional treasury and money-market house that also issues a euro stable-value token. Active, attested by its own dossier only.",
  }),
  richIssuer({
    id: "cobaltine-fund-services",
    name: "Cobaltine Fund Services",
    tier: "demo",
    jurisdiction: "Luxembourg",
    kind: "UCITS-style management company, a category supervised in Luxembourg",
    categories: [C.igBond, C.basket, C.mmf, C.vcpe],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional fund administrator with the widest product list: bond fund, index tracker, a euro money-market wrapper and a buyout-fund feeder. Active.",
  }),
  richIssuer({
    id: "emerald-tern-capital",
    name: "Emerald Tern Capital",
    tier: "demo",
    jurisdiction: "Ireland",
    kind: "Fund manager of a category supervised in Ireland",
    categories: [FUND, C.mmf, C.stable],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional short-duration specialist: treasury, ladder and money-market funds and a euro stable-value wrapper. Active; the second wrapper of several pairs.",
  }),
  richIssuer({
    id: "kittiwake-cayman-partners",
    name: "Kittiwake Cayman Partners",
    tier: "full",
    jurisdiction: "Cayman Islands",
    kind: "Private-fund sponsor of a category registered in the Cayman Islands",
    categories: [C.vcpe, C.cre],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "restricted",
    story:
      "A fictional private-fund sponsor. It was active when its tokens were registered and its pair approved; the registrar later moved it back to restricted after the story says its dossier went stale (2026-10-20). Restricted, unlike deprecated, can be reversed, but nothing does that here.",
  }),
  richIssuer({
    id: "pennywhistle-securities",
    name: "Pennywhistle Securities",
    tier: "demo",
    jurisdiction: "United Kingdom",
    kind: "Securities dealer of a category supervised in the United Kingdom",
    categories: [EQUITY, C.basket],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional dealer that tokenises single shares and an index tracker. Active. One of its shares is delisted in the story and its wrapper deprecated.",
  }),
  richIssuer({
    id: "rheinkontor-digital",
    name: "Rheinkontor Digital",
    tier: "demo",
    jurisdiction: "Germany",
    kind: "Real-estate and bond fund manager of a category supervised in Germany",
    categories: [C.cre, C.resi, C.igBond],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional Frankfurt fund manager: offices, logistics and rental housing funds and a corporate bond fund. Active.",
  }),
  richIssuer({
    id: "sakura-meadow-trust",
    name: "Sakura Meadow Trust",
    tier: "full",
    jurisdiction: "Japan",
    kind: "Funds-transfer or trust company of a category registered in Japan",
    categories: [C.stable, DOLLAR],
    verification: "unverified",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional trust company issuing yen and dollar stable-value tokens. Active but unverified: the registrar activated it with a dossier and did not record it as attested.",
  }),
  richIssuer({
    id: "peninsula-orient-assets",
    name: "Peninsula Orient Assets",
    tier: "full",
    jurisdiction: "Hong Kong",
    kind: "Asset manager of a category licensed in Hong Kong",
    categories: [EQUITY, C.basket],
    verification: "unverified",
    activate: false,
    finalStatus: "restricted",
    story:
      "A fictional applicant whose review is still open: registered, never activated, so its two tokens are registered and restricted. Like Meridian Assets it shows pending tokens.",
  }),
  richIssuer({
    id: "saffron-crescent-capital",
    name: "Saffron Crescent Capital",
    tier: "demo",
    jurisdiction: "United Arab Emirates",
    kind: "Commodities and environmental-markets firm of a category supervised in Abu Dhabi",
    categories: [C.industrial, C.metal, C.carbon],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional Abu Dhabi trading house tokenising oil, copper, gold bars and carbon credits. Active.",
  }),
  richIssuer({
    id: "verde-amazonas-ativos",
    name: "Verde Amazonas Ativos",
    tier: "demo",
    jurisdiction: "Brazil",
    kind: "Environmental-asset originator of a category operating in Brazil",
    categories: [C.carbon],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional forest-credit originator. Active; its one carbon token has a second wrapper from Saffron Crescent.",
  }),
  richIssuer({
    id: "boreal-larch-credit",
    name: "Boreal Larch Credit",
    tier: "demo",
    jurisdiction: "Canada",
    kind: "Private lender and note arranger of a category supervised in Canada",
    categories: [CREDIT],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional lender issuing term notes. Active. One note is redemption-gated: its dossier says redemption opens only after maturity and only if a liquidity condition holds, which nothing on chain checks.",
  }),
  richIssuer({
    id: "wattlebird-capital",
    name: "Wattlebird Capital",
    tier: "full",
    jurisdiction: "Australia",
    kind: "Metals and carbon trader of a category supervised in Australia",
    categories: [C.metal, C.industrial, C.carbon],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "deprecated",
    story:
      "A fictional trader whose self-attestation lapsed on 2026-09-30 and was not renewed, so the registrar deprecated it, which is terminal. The lapse is a story: the registry has no attestation expiry. Its tokens were active and their pairs approved first, and none can convert now.",
  }),
  richIssuer({
    id: "maison-quillon-collections",
    name: "Maison Quillon Collections",
    tier: "demo",
    jurisdiction: "France",
    kind: "Art and collectibles house of a category operating in France",
    categories: [C.art, C.resi],
    verification: "issuer_attested",
    activate: true,
    finalStatus: "active",
    story:
      "A fictional Paris auction-and-custody house that tokenises single works as one indivisible token each, plus one apartment record. Active.",
  }),
  richIssuer({
    id: "baobab-coast-finance",
    name: "Baobab Coast Finance",
    tier: "full",
    jurisdiction: "Mauritius",
    kind: "Investment-dealer applicant of a category licensed in Mauritius",
    categories: [C.mmf],
    verification: "unverified",
    activate: false,
    finalStatus: "rejected",
    story:
      "A fictional applicant the registrar rejected before it issued anything (terminal): the story is a failed review. It has no tokens, like Vantage Credit.",
  }),
];
