// Off-chain profile text for the representations that have no hand-written entry in
// catalogue-profiles.ts (the rich catalogue). It is built from the catalogue data itself, so the
// text cannot drift from the record, and every sentence is fiction and says so.

import type { Rational } from "@pontis/domain";
import type { CatalogueClaim, CatalogueIssuer, CatalogueRepresentation } from "./catalogue.ts";
import type { ProfileText } from "./catalogue-profiles.ts";

const slug = (text: string) =>
  text
    .replace(/^Synthetic /, "")
    .replace(/ \(test only\)$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** How the issuer's trust state reads in a sentence, without claiming any review happened. */
export function issuerState(issuer: CatalogueIssuer): string {
  switch (issuer.finalStatus) {
    case "active":
      return issuer.verification === "issuer_attested"
        ? "which is active in the registry and supplied its own dossier"
        : "which is active in the registry but unverified";
    case "restricted":
      return issuer.activate
        ? "which was restricted after it began issuing, so its tokens cannot convert"
        : "a simulated applicant whose review is still pending, so the token is registered but restricted";
    case "deprecated":
      return "which was deprecated (in the story its attestation lapsed), so its tokens cannot convert";
    case "rejected":
      return "which was rejected";
  }
}

const perToken = (units: Rational) =>
  units.den === 1n ? units.num.toString() : `${units.num}/${units.den}`;

export function richProfileText(
  rep: CatalogueRepresentation,
  claim: CatalogueClaim,
  issuer: CatalogueIssuer,
): ProfileText {
  const state = issuerState(issuer);
  const name = rep.name.replace("SYNTHETIC TEST ", "");
  const delisted = rep.finalStatus === "deprecated";
  const unique = rep.decimals === 0 && rep.startingSupply === 1n;
  const tags = [
    slug(claim.category),
    "synthetic",
    issuer.id.split("-")[0] ?? issuer.id,
    ...(claim.valuationMethod?.includes("NAV") ? ["nav"] : []),
    ...(unique ? ["unique", "single-asset"] : []),
    ...(delisted ? ["delisted"] : []),
    ...(issuer.finalStatus === "restricted" ? ["restricted-issuer"] : []),
    ...(issuer.finalStatus === "deprecated" ? ["deprecated-issuer"] : []),
  ];
  const noted = rep.note ? ` ${rep.note}` : "";
  return {
    description: `SYNTHETIC TEST token: ${name}, a wrapper of ${claim.name}, from ${issuer.name}.`,
    tags: [...new Set(tags)],
    sections: {
      overview: `SYNTHETIC. One token stands for ${perToken(rep.unitsPerToken)} canonical unit of ${claim.name} (${rep.decimals} decimals). ${claim.valuationMethod ?? ""} Issued by the simulated issuer ${issuer.name}, ${state}.${noted}`,
      legal: `SYNTHETIC. ${claim.legalClaimStructure}`,
      custody:
        rep.custodyDescription === "None"
          ? "SYNTHETIC. Nothing is held in custody; the token is unbacked."
          : `SYNTHETIC. ${rep.custodyDescription}`,
      risk: `SYNTHETIC. ${claim.riskDisclosures.join(" ")} Nothing here is investment information.`,
    },
  };
}
