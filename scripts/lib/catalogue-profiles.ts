// Off-chain profile text of each catalogue representation (the `asset_profiles` row, see
// packages/db). Plain data; every sentence is fiction and says so. Structure that comes from the
// catalogue itself (chains, documents, convertible, bridgeable) is derived in seed-profiles.ts.

export interface ProfileText {
  description: string;
  tags: readonly string[];
  /** Tabs of the asset page: overview, legal, custody and risk. */
  sections: { overview: string; legal: string; custody: string; risk: string };
}

const NO_LEGAL =
  "SYNTHETIC. No legal entity, contract, register or trust exists behind this token.";
const NO_CUSTODY = "SYNTHETIC. Nothing is held in custody; the token is unbacked.";

export const PROFILE_TEXT: Readonly<Record<string, ProfileText>> = {
  "tacme-h": {
    description: "SYNTHETIC TEST token for one fictional Acme Corp share, from Halcyon Securities.",
    tags: ["equity", "tokenized-stock", "synthetic", "halcyon"],
    sections: {
      overview:
        "SYNTHETIC. One token stands for one fictional Acme Corp ordinary share. Its price is simulated, with a fictional dividend step on 2026-10-02. Issued by the simulated issuer Halcyon Securities, which supplied its own dossier.",
      legal: NO_LEGAL,
      custody: NO_CUSTODY,
      risk: "SYNTHETIC. The price is simulated and the claim is unbacked. A parity relationship with tacme-m is only proposed, not approved. Nothing here is investment information.",
    },
  },
  "tacme-m": {
    description:
      "SYNTHETIC TEST token for a tenth of a fictional Acme Corp share, from Meridian Assets.",
    tags: ["equity", "tokenized-stock", "synthetic", "meridian", "pending-issuer"],
    sections: {
      overview:
        "SYNTHETIC. One token stands for 0.1 fictional Acme Corp share. Its issuer, Meridian Assets, is a simulated applicant whose review is still pending, so the token is registered but restricted.",
      legal: NO_LEGAL,
      custody: NO_CUSTODY,
      risk: "SYNTHETIC. The token cannot be activated or converted while its issuer is restricted, and its trust state is unverified. The registry records the issuer's status; it has not checked anything.",
    },
  },
  "tustb-h": {
    description:
      "SYNTHETIC TEST token for one unit of a fictional Treasury fund, from Halcyon Securities.",
    tags: ["treasury", "fund", "nav", "synthetic", "halcyon"],
    sections: {
      overview:
        "SYNTHETIC. One token stands for one unit of a fictional Treasury bill fund. Its simulated NAV accrues about 4.5% a year and its market price tracks the NAV closely. It has an approved parity relationship with tustb-o.",
      legal: NO_LEGAL,
      custody: NO_CUSTODY,
      risk: "SYNTHETIC. No fund and no Treasury bill exists; the NAV is a simulator output, not a published figure. Parity conversion says nothing about price.",
    },
  },
  "tustb-o": {
    description:
      "SYNTHETIC TEST token for one unit of a fictional Treasury fund, from Orchard Trust (deprecated issuer).",
    tags: ["treasury", "fund", "nav", "synthetic", "orchard", "deprecated-issuer"],
    sections: {
      overview:
        "SYNTHETIC. One token stands for one unit of a fictional Treasury bill fund. Its issuer, Orchard Trust, was active when the token was registered and has since been deprecated, so the token cannot be converted although its parity relationship with tustb-h was approved.",
      legal: NO_LEGAL,
      custody: NO_CUSTODY,
      risk: "SYNTHETIC. In the fiction the issuer's own attestation lapsed. That is a narrative: the registry has no attestation expiry, and the only on-chain fact is the registrar's status change.",
    },
  },
  "tvilla-1": {
    description:
      "SYNTHETIC TEST record of one fictional villa, a single token that cannot be split.",
    tags: ["real-estate", "property", "single-asset", "synthetic", "halcyon"],
    sections: {
      overview:
        "SYNTHETIC. Exactly one token with 0 decimals stands for the whole fictional Villa Azul. Its price is a simulated appraisal series with one +2.4% step on 2026-09-30. It is shown as bridge-only: it has no parity partner and could later move to an EVM chain as a whole.",
      legal: "SYNTHETIC. No deed, title register, trust or company exists behind this token.",
      custody: "SYNTHETIC. No property exists and no custodian holds anything.",
      risk: "SYNTHETIC. The appraisal is simulated. A supply of one is not enforced against a second record of the same fictional villa. No bridge exists yet.",
    },
  },
  "tcredit-1": {
    description: "SYNTHETIC TEST token for a fictional private-credit note maturing 2028-03-31.",
    tags: ["private-credit", "note", "nav", "synthetic", "halcyon"],
    sections: {
      overview:
        "SYNTHETIC. One token stands for one fictional note of 100 USD nominal. Its simulated NAV accrues about 7% a year. Narrative terms: maturity 2028-03-31, redemption at nominal plus accrued interest.",
      legal: NO_LEGAL,
      custody: NO_CUSTODY,
      risk: "SYNTHETIC. Nothing happens at maturity: no contract redeems or burns the token. The NAV is a simulator output, and a real private-credit note carries default and liquidity risk not modelled here.",
    },
  },
  "tusd-h": {
    description: "SYNTHETIC TEST dollar-pegged quote token from Halcyon Securities.",
    tags: ["stable", "quote-asset", "dollar", "synthetic", "halcyon"],
    sections: {
      overview:
        "SYNTHETIC. One token stands for one fictional US dollar and is meant as a quote asset for the other demo assets. The simulator pulls its price toward 1 USD.",
      legal: NO_LEGAL,
      custody: "SYNTHETIC. No reserve exists; nothing backs the peg.",
      risk: "SYNTHETIC. The peg is a simulator behaviour, not a reserve or a redemption right. A real dollar-pegged token can lose its peg.",
    },
  },
  "tnova-m": {
    description:
      "SYNTHETIC TEST token for one fictional Nova Systems share, with a split announced.",
    tags: [
      "equity",
      "tokenized-stock",
      "corporate-action",
      "synthetic",
      "meridian",
      "pending-issuer",
    ],
    sections: {
      overview:
        "SYNTHETIC. One token stands for one fictional Nova Systems share. A 2-for-1 split was announced on 2026-11-03 for 2026-12-15. It is registered but restricted because its issuer, Meridian Assets, is still pending.",
      legal: NO_LEGAL,
      custody: NO_CUSTODY,
      risk: "SYNTHETIC. The split is a narrative: nothing on chain implements corporate actions yet, no balance or multiplier will change on the effective date, and the simulated price does not include it.",
    },
  },
};
