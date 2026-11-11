// Generates the dossier of a rich-catalogue issuer (docs/asset-dossiers/<ISSUER>.md). Its SHA-256
// is the evidence of the issuer and of its representations, so the text states only what the
// catalogue data says and says plainly that all of it is fictional demo data (ADR 0009, 0019).

import { type CatalogueRepresentation } from "./catalogue.ts";
import {
  DOSSIER_DATE,
  executable,
  multiplierText,
  pairOutcome,
  relationshipsOf,
  repStatus,
  table,
  unitsPerTokenText,
} from "./dossier-format.ts";
import { richFor, type CatalogueData } from "./catalogue-tiers.ts";
import type { RichIssuer } from "./catalogue-rich-types.ts";

function statusLine(issuer: RichIssuer): string {
  switch (issuer.finalStatus) {
    case "active":
      return "`active`";
    case "restricted":
      return issuer.activate
        ? "`restricted`: it was `active` while its tokens were registered and its pairs approved, then a registrar moved it back to `restricted`"
        : "`restricted`: registered, review pending, never activated";
    case "deprecated":
      return "`deprecated`: it was `active` while its tokens were registered and its pairs approved, then a registrar deprecated it (terminal)";
    case "rejected":
      return "`rejected`: a registrar rejected it before it issued anything (terminal)";
  }
}

function stateSection(issuer: RichIssuer): string {
  switch (issuer.finalStatus) {
    case "deprecated":
      return `## The lapsed attestation is a narrative

In the fiction, this issuer provided its own attestation, which lapsed on 2026-09-30 without renewal, and the registrar deprecated the issuer. **That is a story, not a mechanism.** The registry has no attestation expiry: nothing checked a date, and nothing downgraded the record automatically. \`verification_status\` stays \`issuer_attested\` because records cannot be edited after registration; the only on-chain fact is that a registrar moved the issuer to \`deprecated\`, a terminal status. The contract treats a representation as executable only while its issuer is \`active\`, so none of the tokens below can convert, although their relationships were approved while the issuer was active.`;
    case "restricted":
      return issuer.activate
        ? `## Why the tokens cannot convert

The tokens below were registered and activated while the issuer was \`active\`, and their relationships were approved then. A registrar later moved the issuer back to \`restricted\`. The contract treats a representation as executable only while its issuer is \`active\`, so no conversion involving them can run. Nothing re-activates the issuer here.`
        : `## Why the tokens are pending

The contract activates a representation only while its issuer is \`active\`. This issuer was registered with its dossier but never activated, so its tokens are registered and stay \`restricted\`: they exist in the registry, can be minted by the owner and allowlisted, and cannot be activated, approved into a pair or converted.`;
    case "rejected":
      return `## Why there are no tokens

A rejected issuer's tokens could never be activated, so the seed registers none. The review that rejected it is a story: no review process exists, only a registrar moving a record between statuses.`;
    case "active":
      return issuer.verification === "issuer_attested"
        ? ""
        : `## Why it is unverified

The registrar activated this issuer on the strength of its dossier and did not record it as \`issuer_attested\`. The contract allows that: activation needs evidence, not a verification status.`;
  }
}

const tierOf = new Map(richFor("full").representations.map((r) => [r.id, r.tier]));

function repRow(rep: CatalogueRepresentation, issuer: RichIssuer, data: CatalogueData): string[] {
  const pairs = relationshipsOf(rep, data.relationships).map((r) => {
    const other = r.a === rep.id ? r.b : r.a;
    return `Pair with \`${other}\`: ${pairOutcome(r)}`;
  });
  const notes = [rep.note, ...pairs].filter((n): n is string => Boolean(n));
  return [
    `\`${rep.id}\``,
    `\`${rep.claimId}\``,
    String(rep.decimals),
    unitsPerTokenText(rep),
    `\`${multiplierText(rep)}\``,
    `\`${repStatus(rep, issuer)}\`${executable(rep, issuer) ? "" : " (cannot convert)"}`,
    `\`${tierOf.get(rep.id) ?? "demo"}\``,
    notes.map((n) => n.replace(/\.$/, "")).join("; ") || "No relationship",
  ];
}

export function issuerDossier(issuer: RichIssuer, data: CatalogueData): string {
  const reps = data.representations.filter((r) => r.issuerId === issuer.id);
  const categories = issuer.authorizedCategories.join("; ");
  const contracts =
    reps.length === 0
      ? "None: the issuer was rejected before it issued anything"
      : `The ${reps.length} \`synthetic-token\` contract${reps.length === 1 ? "" : "s"} below; the owner account controls mint, burn, pause and faucet`;
  const state = stateSection(issuer);
  const unique = reps.filter((r) => r.decimals === 0 && r.startingSupply === 1n);
  return `# Dossier: ${issuer.dossier} (issuer and its representations)

> **FICTIONAL DEMO DATA. SIMULATED ISSUER. SYNTHETIC TEST TOKENS. UNBACKED. NOT VERIFIED BY ANYONE.**
> ${issuer.name.replace(" (simulated)", "")} does not exist. Its name, domain and tickers are invented and imitate no real company or product; its jurisdiction is a real place used only as a plain fact. It is not licensed, registered or supervised by anyone.

- **Record types:** issuer (brief §6.2) and token representations (brief §6.4)
- **Dossier version:** 1
- **Evidence provenance:** \`issuer_provided\`; no third-party check
- **Related decisions:** [ADR 0009](../decisions/0009-synthetic-evidence-labelling.md), [ADR 0019](../decisions/0019-phase-3-scope-and-demo-issuers.md)
- **Catalogue tier:** \`${issuer.tier}\` and above (\`--catalogue=${issuer.tier === "demo" ? "demo|full" : "full"}\`)
- **Deployed account IDs:** \`<representation_id>.<deployer>\`, recorded in \`docs/architecture/deployment-record.md\` after deployment. They are deliberately not part of this dossier so its hash stays stable.

## Issuer record

${table(
  ["Field", "Value"],
  [
    ["`issuer_id`", `\`${issuer.id}\``],
    [
      "Legal entity name",
      `${issuer.name.replace(" (simulated)", "")} (fictional; no legal entity)`,
    ],
    [
      "Jurisdiction",
      `${issuer.jurisdiction} (a real place, as a plain fact; the issuer is fictional)`,
    ],
    ["Kind of firm (fiction)", issuer.kind],
    [
      "Fictional domain",
      `\`${issuer.id}.example\` (a reserved example domain; no website or mailbox exists)`,
    ],
    ["Documentation", "This dossier"],
    ["Issuer status", statusLine(issuer)],
    ["Authorized asset categories", categories],
    ["Issuer-controlled contracts and admin roles", contracts],
    ["Custodian / service providers", "None"],
    ["Audit / attestation providers", "None"],
    ["Contact and incident information", issuer.contact ?? ""],
    ["`synthetic` / `verification_status`", `\`true\` / \`${issuer.verification}\``],
  ],
)}

## Story (fiction)

${issuer.story}

${state}${state ? "\n\n" : ""}## Representations issued

${
  reps.length === 0
    ? "None."
    : `${table(
        [
          "Representation",
          "Claim",
          "Decimals",
          "1 whole token =",
          "Multiplier per smallest unit",
          "Record status",
          "Tier",
          "Notes",
        ],
        reps.map((r) => repRow(r, issuer, data)),
      )}

All: \`synthetic\` \`true\`, \`verification_status\` \`${issuer.verification}\`, NEP-141 on NEAR Testnet, owner mint and burn, owner pause, testnet allowlist in \`pontis-core\` ([ADR 0005](../decisions/0005-allowlist-eligibility.md)), no custody, backing or redemption, no bridge (\`bridge_status\` \`none\`).${unique.length > 0 ? ` ${unique.map((r) => `\`${r.id}\``).join(" and ")} ${unique.length === 1 ? "is" : "are"} one indivisible record with a supply of exactly 1 and no faucet.` : ""}`
}

## What was checked, by whom, when

- **Checked:** that each decimals value and multiplier above is consistent with its "1 whole token =" column.
- **By:** the Pontis project team (self-attestation). No outside party exists.
- **When:** ${DOSSIER_DATE}, at dossier version 1.
- **Not checked:** backing, custody, legal rights, redemption, issuer identity, licensing, jurisdiction. \`${issuer.verification}\` records ${issuer.verification === "issuer_attested" ? "that evidence was provided; it is not a verification" : "that no attestation was recorded"}.
`;
}
