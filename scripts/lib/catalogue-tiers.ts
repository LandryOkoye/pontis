// The catalogue tiers (`--catalogue=mvp|demo|full`). Each representation needs a deployed token
// account that costs NEAR and time (scripts/lib/catalogue-cost.ts), so the catalogue comes in
// three sizes and the default is the middle one:
//
//   mvp   no catalogue at all: only the MVP pair (tgold-a / tgold-b) that `seed` registers. What a
//         sandbox, CI or the end-to-end suite uses.
//   demo  the phase 1 catalogue (4 issuers, 6 claims, 8 tokens) plus the rich entries marked
//         `demo`: at least one claim of every category with a conversion pair, a few trust states.
//   full  everything: the phase 1 catalogue and every rich entry (ADR 0019 section 3).
//
// Phase 4 (custodians, reserves, redemption) attaches its data to this catalogue by id; see
// PHASE_4_EXTENSION_POINT below.

import {
  CLAIMS,
  ISSUERS,
  RELATIONSHIPS,
  REPRESENTATIONS,
  type CatalogueClaim,
  type CatalogueIssuer,
  type CatalogueRelationship,
  type CatalogueRepresentation,
} from "./catalogue.ts";
import { RICH_ISSUERS } from "./catalogue-rich-issuers.ts";
import { RICH_ASSET_CLAIMS } from "./catalogue-rich-claims-assets.ts";
import { RICH_FUND_CLAIMS } from "./catalogue-rich-claims-funds.ts";
import { RICH_OTHER_CLAIMS } from "./catalogue-rich-claims-other.ts";
import { RICH_RELATIONSHIPS } from "./catalogue-rich-relationships.ts";
import { RICH_FUND_REPRESENTATIONS } from "./catalogue-rich-reps-funds.ts";
import { RICH_OTHER_REPRESENTATIONS } from "./catalogue-rich-reps-other.ts";
import type {
  RichClaim,
  RichIssuer,
  RichRelationship,
  RichRepresentation,
  RichTier,
} from "./catalogue-rich-types.ts";

export const TIERS = ["mvp", "demo", "full"] as const;
export type CatalogueTier = (typeof TIERS)[number];
export const DEFAULT_TIER: CatalogueTier = "demo";

/** What a seed, deploy or profile run works on: plain data, no chain or file access. */
export interface CatalogueData {
  issuers: readonly CatalogueIssuer[];
  claims: readonly CatalogueClaim[];
  representations: readonly CatalogueRepresentation[];
  relationships: readonly CatalogueRelationship[];
}

/** The phase 1 catalogue alone: what every plan function works on unless it is given a tier. */
export const BASE_CATALOGUE: CatalogueData = {
  issuers: ISSUERS,
  claims: CLAIMS,
  representations: REPRESENTATIONS,
  relationships: RELATIONSHIPS,
};

/** The rich entries of a tier, with the extra fields the dossier generator needs. */
export interface RichData {
  issuers: readonly RichIssuer[];
  claims: readonly RichClaim[];
  representations: readonly RichRepresentation[];
  relationships: readonly RichRelationship[];
}

const ALL_RICH: RichData = {
  issuers: RICH_ISSUERS,
  claims: [...RICH_FUND_CLAIMS, ...RICH_ASSET_CLAIMS, ...RICH_OTHER_CLAIMS],
  representations: [...RICH_FUND_REPRESENTATIONS, ...RICH_OTHER_REPRESENTATIONS],
  relationships: RICH_RELATIONSHIPS,
};

const includes = (tier: CatalogueTier, entry: RichTier) =>
  tier === "full" || (tier === "demo" && entry === "demo");

export function richFor(tier: CatalogueTier): RichData {
  const keep = <T extends { tier: RichTier }>(items: readonly T[]) =>
    items.filter((i) => includes(tier, i.tier));
  return {
    issuers: keep(ALL_RICH.issuers),
    claims: keep(ALL_RICH.claims),
    representations: keep(ALL_RICH.representations),
    relationships: keep(ALL_RICH.relationships),
  };
}

/** The catalogue of a tier: empty for `mvp`, else the phase 1 catalogue plus its rich entries. */
export function catalogueFor(tier: CatalogueTier): CatalogueData {
  if (tier === "mvp") return { issuers: [], claims: [], representations: [], relationships: [] };
  const rich = richFor(tier);
  return {
    issuers: [...BASE_CATALOGUE.issuers, ...rich.issuers],
    claims: [...BASE_CATALOGUE.claims, ...rich.claims],
    representations: [...BASE_CATALOGUE.representations, ...rich.representations],
    relationships: [...BASE_CATALOGUE.relationships, ...rich.relationships],
  };
}

export function parseTier(value: string): CatalogueTier {
  if ((TIERS as readonly string[]).includes(value)) return value as CatalogueTier;
  throw new Error(`--catalogue must be one of ${TIERS.join(", ")}, not "${value}"`);
}

/**
 * The tier named by `--catalogue=<tier>` in `argv`. A bare `--catalogue` means the default tier;
 * `whenAbsent` is what a command does without the flag (the seed commands default to `demo`, the
 * deploy command to `mvp`, which is what it did before tiers existed).
 */
export function tierFromArgs(argv: readonly string[], whenAbsent: CatalogueTier): CatalogueTier {
  let found: CatalogueTier | undefined;
  for (const arg of argv) {
    if (arg !== "--catalogue" && !arg.startsWith("--catalogue=")) continue;
    if (found !== undefined) throw new Error("--catalogue given twice");
    found = arg === "--catalogue" ? DEFAULT_TIER : parseTier(arg.slice("--catalogue=".length));
  }
  return found ?? whenAbsent;
}

/**
 * Phase 4 extension point. Custodians, reserve attestations and redemption terms are not part of
 * this catalogue (ADR 0019 non-goals). They will attach by id to the entries above, in their own
 * data files: a custodian per issuer id, a reserve report and a redemption window per
 * representation id. Nothing here reads them, and nothing here claims custody, reserves or
 * redeemability: every custody and redemption field stays "None".
 */
export const PHASE_4_EXTENSION_POINT = "custodians, reserves and redemption attach by id" as const;
