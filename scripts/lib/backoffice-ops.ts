// Argument parsing and chain reads for the simulated issuer back-office (scripts/backoffice.ts,
// docs/runbooks/reserves-and-redemption.md). SIMULATED: a test account listed in an issuer's
// `controlled_accounts` plays the issuer; nothing here authenticates a real issuer.

import { id, optional, positional, split, takeAll } from "./arg-parse.ts";
import type { RedemptionView } from "./backoffice-plan.ts";
import { integer } from "./reserve-ops.ts";
import type { RepresentationRef, View } from "./reserve-chain.ts";

type Env = Record<string, string | undefined>;

export const DEFAULT_ACCEPT_AFTER_MS = 10_000;
export const DEFAULT_FULFIL_AFTER_MS = 20_000;
export const DEFAULT_POLL_MS = 5_000;
const MAX_DELAY_MS = 2_592_000_000;
const PAGE = 100;

export interface BackofficeCommand {
  acceptAfterMs: number;
  fulfilAfterMs: number;
  intervalMs: number;
  /** One round, then exit, instead of polling. */
  once: boolean;
  /** Redemption ids to leave untouched so they expire. */
  ignore: number[];
  /** Representation ids to serve; empty means use the issuers, or else every redeemable one. */
  representations: string[];
  /** Issuer ids whose representations to serve (also `BACKOFFICE_ISSUER_IDS`, comma-separated). */
  issuers: string[];
}

export const BACKOFFICE_USAGE = [
  "usage: backoffice [--accept-after-ms 10000] [--fulfil-after-ms 20000] [--interval-ms 5000]",
  "                  [--once] [--ignore <redemption id>]... [--representation <id>]... [--issuer <id>]...",
  "SIMULATED issuer back-office; testnet and sandbox only. Needs BACKOFFICE_ACCOUNT_ID, which must be",
  "in the issuer's controlled_accounts. --ignore leaves a redemption untouched so it expires.",
].join("\n");

export function parseBackofficeArgs(argv: string[], env: Env = process.env): BackofficeCommand {
  const ignored = takeAll(argv, "ignore");
  const reps = takeAll(ignored.rest, "representation");
  const issuers = takeAll(reps.rest, "issuer");
  const p = split(
    issuers.rest,
    ["accept-after-ms", "fulfil-after-ms", "interval-ms"],
    ["once", "help"],
  );
  if (p.flags.has("help")) throw new Error(BACKOFFICE_USAGE);
  positional(p, 0, "no arguments");
  const fromEnv = (env.BACKOFFICE_ISSUER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const issuerIds = [...(issuers.values.length > 0 ? issuers.values : fromEnv)];
  const ignore = ignored.values.map((v) => integer(v, "ignore", 0, Number.MAX_SAFE_INTEGER));
  return {
    acceptAfterMs: integer(
      optional(p, "accept-after-ms") ?? String(DEFAULT_ACCEPT_AFTER_MS),
      "accept-after-ms",
      0,
      MAX_DELAY_MS,
    ),
    fulfilAfterMs: integer(
      optional(p, "fulfil-after-ms") ?? String(DEFAULT_FULFIL_AFTER_MS),
      "fulfil-after-ms",
      0,
      MAX_DELAY_MS,
    ),
    intervalMs: integer(
      optional(p, "interval-ms") ?? String(DEFAULT_POLL_MS),
      "interval-ms",
      1_000,
      3_600_000,
    ),
    once: p.flags.has("once"),
    ignore: [...new Set(ignore)].sort((a, b) => a - b),
    representations: reps.values.map((v) => id(v, "representation")),
    issuers: issuerIds.map((v) => id(v, "issuer id")),
  };
}

export interface IssuerRef {
  id: string;
  controlled_accounts: string[];
}

export interface Selected {
  representations: RepresentationRef[];
  /** Why a representation is not served, for the log. */
  notes: string[];
}

/**
 * The representations the back-office serves. By `--representation`, else by issuer, else every
 * representation that has redemption terms. In every case the account must be in the issuer's
 * `controlled_accounts`: the contract refuses anything else.
 */
export async function selectRepresentations(
  view: View,
  coreId: string,
  all: readonly RepresentationRef[],
  issuers: readonly IssuerRef[],
  command: Pick<BackofficeCommand, "representations" | "issuers">,
  accountId: string,
): Promise<Selected> {
  const notes: string[] = [];
  for (const wanted of command.representations) {
    if (!all.some((r) => r.id === wanted)) notes.push(`${wanted}: no such representation`);
  }
  for (const wanted of command.issuers) {
    if (!issuers.some((i) => i.id === wanted)) notes.push(`${wanted}: no such issuer`);
  }
  const explicit = command.representations.length > 0;
  const byIssuer = command.issuers.length > 0;
  const representations: RepresentationRef[] = [];
  for (const rep of all) {
    if (explicit && !command.representations.includes(rep.id)) continue;
    if (!explicit && byIssuer && !command.issuers.includes(rep.issuer_id)) continue;
    if (!explicit && !byIssuer) {
      const terms = await view(coreId, "get_redemption_terms", { representation_id: rep.id });
      if (!terms) continue;
    }
    const issuer = issuers.find((i) => i.id === rep.issuer_id);
    if (!issuer?.controlled_accounts.includes(accountId)) {
      notes.push(`${rep.id}: ${accountId} is not in the controlled_accounts of ${rep.issuer_id}`);
      continue;
    }
    representations.push(rep);
  }
  return { representations, notes };
}

/** Every redemption of a representation, paged (limit 100) until `total` is covered. */
export async function fetchRedemptions(
  view: View,
  coreId: string,
  representationId: string,
): Promise<RedemptionView[]> {
  const all: RedemptionView[] = [];
  for (let from = 0; ;) {
    const page = await view<{ items: RedemptionView[]; total: number }>(
      coreId,
      "get_redemptions_by_representation",
      { representation_id: representationId, from_index: from, limit: PAGE },
    );
    if (!page || page.items.length === 0) return all;
    all.push(...page.items);
    from += page.items.length;
    if (from >= page.total) return all;
  }
}
