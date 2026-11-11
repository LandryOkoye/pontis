// Generates the dossier of a rich-catalogue claim (docs/asset-dossiers/SYN-*.md). Its SHA-256 is
// the evidence of the claim and of the relationships between its wrappers, so the text states only
// what the catalogue data says and says plainly that all of it is fictional demo data (ADR 0009).

import {
  DOSSIER_DATE,
  categoryLabel,
  multiplierText,
  pairOutcome,
  ratioText,
  repStatus,
  table,
  unitsPerTokenText,
} from "./dossier-format.ts";
import type { CatalogueData } from "./catalogue-tiers.ts";
import type { RichClaim } from "./catalogue-rich-types.ts";

const dash = (text: string | null | undefined) => (text && text.trim() ? text : "None");

export function claimDossier(claim: RichClaim, data: CatalogueData): string {
  const reps = data.representations.filter((r) => r.claimId === claim.id);
  const repById = new Map(data.representations.map((r) => [r.id, r]));
  const issuerById = new Map(data.issuers.map((i) => [i.id, i]));
  const pairs = data.relationships.filter((r) => repById.get(r.a)?.claimId === claim.id);
  const unique = reps.length === 1 && reps[0]?.decimals === 0 && reps[0].startingSupply === 1n;
  const bridgeOnly = unique ? " It is bridge-only: there is no parity partner." : "";
  const corporate = claim.corporateAction
    ? `\n## Corporate action record (dossier only)\n\n${claim.corporateAction}\n`
    : "";
  return `# Dossier: ${claim.dossier} (canonical claim)

> **FICTIONAL DEMO DATA. SYNTHETIC TEST CLAIM. UNBACKED. UNVERIFIED BY DESIGN.**
> This is not ${/^[AEIOU]/i.test(categoryLabel(claim.category)) ? "an" : "a"} ${categoryLabel(claim.category).toLowerCase()} and holds nothing. Every name, ticker and figure is invented and imitates no real company, fund or product. It exists only so the demo catalogue looks like a market on NEAR Testnet.

- **Record type:** canonical asset / claim (brief §6.3)
- **Dossier version:** 1
- **Evidence provenance:** \`issuer_provided\`; nothing here was checked by a third party
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0015](../decisions/0015-market-data-platform.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** \`${claim.tier}\` and above (\`--catalogue=${claim.tier === "demo" ? "demo|full" : "full"}\`)

## Record

${table(
  ["Field", "Value"],
  [
    ["`canonical_asset_id`", `\`${claim.id}\``],
    ["Name", claim.name],
    ["Asset category", claim.category],
    ["Underlying instrument or claim", claim.claimDescription],
    ["Unit definition", claim.unitDefinition],
    ["Currency / denomination", dash(claim.denomination)],
    ["Economic rights", claim.economicRights],
    ["Legal claim structure", claim.legalClaimStructure],
    [
      "Jurisdiction",
      claim.jurisdiction
        ? `${claim.jurisdiction} (a real place, as a plain fact; the claim is fictional)`
        : "None",
    ],
    ["Redemption and settlement terms", claim.redemptionTerms],
    ["Valuation / NAV method", dash(claim.valuationMethod)],
    ["Lifecycle model", claim.lifecycle],
    ["Eligibility restrictions", claim.eligibilityRestrictions],
    ["Risk disclosures", "See below"],
    ["`synthetic`", "`true`"],
    ["`verification_status`", "`unverified`"],
    ["Record status", "`active` once registered with this evidence"],
  ],
)}

## Risk disclosures

${claim.riskDisclosures.map((r) => `- ${r}`).join("\n")}
- Do not infer that any real instrument is equivalent to anything here.
${corporate}
## Story (fiction)

${claim.story}${bridgeOnly}

## What was checked, by whom, when

- **Checked:** that the unit definition is consistent with the unit multipliers recorded in the issuer dossiers of the representations below.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** ${DOSSIER_DATE}, at dossier version 1.
- **Not checked:** everything else. No custody, legal, audit or issuer verification exists.

## Representations of this claim

${table(
  [
    "Representation",
    "Issuer",
    "Decimals",
    "1 whole token =",
    "Multiplier per smallest unit",
    "Record status",
    "Dossier",
  ],
  reps.map((r) => {
    const issuer = issuerById.get(r.issuerId);
    return [
      `\`${r.id}\``,
      `\`${r.issuerId}\``,
      String(r.decimals),
      unitsPerTokenText(r),
      `\`${multiplierText(r)}\``,
      issuer ? `\`${repStatus(r, issuer)}\`` : "unknown",
      issuer ? `[${issuer.dossier}.md](${issuer.dossier}.md)` : "unknown",
    ];
  }),
)}
${
  pairs.length === 0
    ? "\nThis claim has one representation, so no relationship exists for it.\n"
    : `
## Relationships

A shared \`canonical_asset_id\` is a candidate association only. Only an approved \`DIRECT_EQUIVALENT\` relationship enables parity conversion, and only while both issuers are \`active\`. Ratios are output smallest units of the second token per smallest unit of the first, derived from the unit multipliers (ADR 0001).

${table(
  ["Pair", "Outcome", "Ratio", "Why"],
  pairs.map((p) => {
    const [a, b] = [repById.get(p.a), repById.get(p.b)];
    const ratio = a && b ? ratioText(a, b) : "unknown";
    return [`\`${p.a}\` : \`${p.b}\``, pairOutcome(p), `\`${ratio}\``, p.approvalRationale];
  }),
)}
`
}`;
}
