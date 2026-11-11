// Shared by the catalogue tests.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { REPRESENTATIONS } from "../lib/catalogue.ts";
import { buildCatalogue } from "../lib/catalogue-plan.ts";
import { REPO_ROOT } from "../lib/evidence.ts";

export const plan = buildCatalogue("pontis.testnet");

export const unique = (ids: string[]) => new Set(ids).size === ids.length;

export const sha256 = (path: string) =>
  createHash("sha256")
    .update(readFileSync(`${REPO_ROOT}/${path}`))
    .digest("hex");

export function find(id: string) {
  const rep = REPRESENTATIONS.find((r) => r.id === id);
  if (!rep) throw new Error(`no representation ${id}`);
  return rep;
}
