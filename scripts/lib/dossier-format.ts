// Shared pieces of the generated dossiers (docs/asset-dossiers): how a multiplier, a ratio, a
// status and a table are written. Pure; the dossiers state facts of the catalogue data, nothing else.

import { ratioBetween, type Rational } from "@pontis/domain";
import {
  unitMultiplier,
  type CatalogueIssuer,
  type CatalogueRelationship,
  type CatalogueRepresentation,
} from "./catalogue.ts";

export const DOSSIER_DATE = "2026-11-11";

/** A row of a markdown table: pipes inside a cell are escaped. */
export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const row = (cells: readonly string[]) =>
    `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [row(header), row(header.map(() => "---")), ...rows.map(row)].join("\n");
}

/** `10^6` for a power of ten, else the digits. */
function power(n: bigint): string {
  const digits = n.toString();
  return /^10*$/.test(digits) && digits.length > 1 ? `10^${digits.length - 1}` : digits;
}

export function rationalText(r: Rational): string {
  return r.den === 1n ? power(r.num) : `${power(r.num)} / ${power(r.den)}`;
}

/** Canonical units per smallest token unit, as the contract stores it. */
export const multiplierText = (rep: CatalogueRepresentation) => rationalText(unitMultiplier(rep));

export function unitsPerTokenText(rep: CatalogueRepresentation): string {
  const { num, den } = rep.unitsPerToken;
  const units = den === 1n ? num.toString() : `${num} / ${den}`;
  return units === "1" ? "1 canonical unit" : `${units} canonical unit`;
}

/** Output smallest units of b per smallest unit of a. */
export function ratioText(a: CatalogueRepresentation, b: CatalogueRepresentation): string {
  const r = ratioBetween(unitMultiplier(a), unitMultiplier(b));
  return `${r.num} / ${r.den}`;
}

/** The record status the seed leaves a representation in. */
export function repStatus(rep: CatalogueRepresentation, issuer: CatalogueIssuer): string {
  if (!issuer.activate) return "restricted";
  return rep.finalStatus ?? "active";
}

/** Whether the contract can execute a conversion of it: the record and its issuer must be active. */
export function executable(rep: CatalogueRepresentation, issuer: CatalogueIssuer): boolean {
  return repStatus(rep, issuer) === "active" && issuer.finalStatus === "active";
}

export function pairOutcome(rel: CatalogueRelationship): string {
  const kind = rel.classification ?? "DIRECT_EQUIVALENT";
  if (rel.review === "reject") return `${kind}, rejected`;
  if (!rel.approve) return `${kind}, proposed only`;
  return `${kind}, approved${rel.guard ? ` with a \`${rel.guard}\` guard` : ""}`;
}

export function relationshipsOf(
  rep: CatalogueRepresentation,
  relationships: readonly CatalogueRelationship[],
): CatalogueRelationship[] {
  return relationships.filter((r) => r.a === rep.id || r.b === rep.id);
}

/** A short category label: "Synthetic Treasury fund (test only)" becomes "Treasury fund". */
export function categoryLabel(category: string): string {
  return category.replace(/^Synthetic /, "").replace(/ \(test only\)$/, "");
}
