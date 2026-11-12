// Shared by the rich catalogue tests: the full catalogue, its plan and small lookups.

import type { CatalogueIssuer } from "../lib/catalogue.ts";
import { buildCatalogue } from "../lib/catalogue-plan.ts";
import { catalogueFor, richFor } from "../lib/catalogue-tiers.ts";

export const full = catalogueFor("full");
export const rich = richFor("full");
export const plan = buildCatalogue("pontis.testnet", undefined, full);

export function issuerOf(id: string): CatalogueIssuer {
  const found = full.issuers.find((i) => i.id === id);
  if (!found) throw new Error(`no issuer ${id}`);
  return found;
}

export const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;
