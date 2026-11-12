// The `reserves` commands (docs/runbooks/reserves-and-redemption.md): argument parsing and the
// exact JSON arguments of the contract methods of ADR 0020 sections 1, 2 and 4. Pure: no chain,
// no clock, no files, so it is tested directly. Everything these commands set up is SIMULATED.

import { devKey } from "@pontis/dev-keys";
import {
  SHA256,
  id,
  oneOf,
  optional,
  positional,
  split,
  takeAll,
  text,
  type Parsed,
} from "./arg-parse.ts";
import type { NewEvidence } from "./evidence.ts";

export const GRANTABLE_ROLES = ["registrar", "reserve_attester"] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];
export const CUSTODY_STRUCTURES = ["segregated", "omnibus", "on_chain_vault"] as const;
export type CustodyStructure = (typeof CUSTODY_STRUCTURES)[number];
export const VERIFICATION_STATUSES = [
  "unverified",
  "issuer_attested",
  "third_party_attested",
] as const;
export type CustodianVerification = (typeof VERIFICATION_STATUSES)[number];
export const RESERVE_ACTIONS = ["warn", "restrict_conversions", "pause_mint"] as const;
export type ReserveAction = (typeof RESERVE_ACTIONS)[number];
export const RESERVE_SCOPES = ["reserves", "custody"] as const;

export const DEFAULT_PUBLISH_INTERVAL_MS = 30_000;
export const DEFAULT_COVER_BPS = 10_000;
/** The simulator may cover a token up to ten times over; more is a typo, not a scenario. */
export const MAX_COVER_BPS = 100_000;

export interface ReservePolicyArgs {
  tolerance_bps: number;
  max_reserve_age_ms: number;
  action: ReserveAction;
  baseline_supply: string;
}

export type ReservesCommand =
  | { kind: "status"; representationId: string | null }
  | { kind: "grant-role"; role: GrantableRole; accountId: string }
  | { kind: "register-attester"; accountId: string; scopes: string[] }
  | {
      kind: "register-custodian";
      id: string;
      name: string;
      jurisdiction: string | null;
      attesterKey: string;
      verification: CustodianVerification;
      evidence: NewEvidence[];
    }
  | { kind: "link"; representationId: string; structure: CustodyStructure; custodianIds: string[] }
  | { kind: "set-policy"; representationId: string; policy: ReservePolicyArgs }
  | { kind: "set-minter"; representationId: string }
  | {
      kind: "publish";
      loop: boolean;
      intervalMs: number;
      coverBps: number;
      custodianId: string | null;
      /** Representations the simulated custodian leaves alone, so a lapsed or missing attestation stays that way. */
      skip: string[];
    }
  | { kind: "drift"; representationId: string; coverBps: number | null };

export const RESERVES_USAGE = [
  "usage: reserves <command>   (testnet and sandbox only; every figure is SIMULATED)",
  "  status [<representation>]",
  "  grant-role <registrar|reserve_attester> <account>",
  "  register-attester <account> [--scopes reserves,custody]",
  "  register-custodian <id> --name <text> [--jurisdiction <code>] [--attester-key <key>]",
  "      [--verification unverified|issuer_attested|third_party_attested]",
  "      [--evidence-uri <uri> --evidence-sha256 <hex> --evidence-description <text>]",
  "  link <representation> <segregated|omnibus|on_chain_vault> <custodian> [<custodian>...]",
  "  set-policy <representation> --action warn|restrict_conversions|pause_mint",
  "      [--tolerance-bps 0] [--max-age-ms 86400000] [--baseline-supply 0]",
  "  set-minter <representation>",
  "  publish [--loop] [--interval-ms 30000] [--cover-bps 10000] [--custodian <id>] [--skip <representation>]...",
  "  drift <representation> <bps|clear>",
].join("\n");

const ACCOUNT_ID = /^[a-z0-9]+([_.-][a-z0-9]+)*$/;
const PUBLIC_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,50}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,37})$/;

/** A base-10 integer in `[min, max]`; `Number("1e3")` and friends are refused. */
export function integer(value: string, name: string, min: number, max: number): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`--${name} must be an integer from ${min} to ${max}`);
  }
  return n;
}

export function accountId(value: string, what: string): string {
  if (!ACCOUNT_ID.test(value) || value.length > 64) {
    throw new Error(`${what} must be a NEAR account id`);
  }
  return value;
}

function publicKey(value: string, name: string): string {
  if (!PUBLIC_KEY.test(value)) throw new Error(`--${name} must be an ed25519:<base58> public key`);
  return value;
}

function evidenceFrom(p: Parsed): NewEvidence[] {
  const uri = optional(p, "evidence-uri");
  const sha256 = optional(p, "evidence-sha256");
  const description = optional(p, "evidence-description");
  if (uri === undefined && sha256 === undefined && description === undefined) return [];
  if (uri === undefined || sha256 === undefined || description === undefined) {
    throw new Error("--evidence-uri, --evidence-sha256 and --evidence-description go together");
  }
  if (!SHA256.test(sha256)) {
    throw new Error("--evidence-sha256 must be 64 lowercase hex characters");
  }
  return [{ uri, sha256, provenance: "issuer_provided", description }];
}

export function parseReservesArgs(argv: string[]): ReservesCommand {
  const [kind, ...rest] = argv;
  switch (kind) {
    case "status": {
      const p = split(rest, []);
      if (p.positionals.length > 1) throw new Error("expected [<representation>]");
      const [rep] = p.positionals;
      return { kind, representationId: rep === undefined ? null : id(rep, "representation") };
    }
    case "grant-role": {
      const p = split(rest, []);
      const [role, account] = positional(p, 2, "<registrar|reserve_attester> <account>");
      return {
        kind,
        role: oneOf(role!, GRANTABLE_ROLES, "role"),
        accountId: accountId(account!, "account"),
      };
    }
    case "register-attester": {
      const p = split(rest, ["scopes"]);
      const [account] = positional(p, 1, "<account>");
      const scopes = (optional(p, "scopes") ?? "reserves").split(",");
      for (const scope of scopes) oneOf(scope, RESERVE_SCOPES, "--scopes entry");
      if (new Set(scopes).size !== scopes.length) throw new Error("--scopes lists a scope twice");
      return { kind, accountId: accountId(account!, "account"), scopes };
    }
    case "register-custodian": {
      const p = split(rest, [
        "name",
        "jurisdiction",
        "attester-key",
        "verification",
        "evidence-uri",
        "evidence-sha256",
        "evidence-description",
      ]);
      const [custodian] = positional(p, 1, "<id>");
      const key = optional(p, "attester-key");
      return {
        kind,
        id: id(custodian!, "custodian id"),
        name: text(p, "name"),
        jurisdiction: optional(p, "jurisdiction") ?? null,
        attesterKey:
          key === undefined ? devKey("reserve-attester").publicKey : publicKey(key, "attester-key"),
        verification: oneOf(
          optional(p, "verification") ?? "unverified",
          VERIFICATION_STATUSES,
          "--verification",
        ),
        evidence: evidenceFrom(p),
      };
    }
    case "link": {
      const p = split(rest, []);
      const [rep, structure, ...custodians] = p.positionals;
      if (rep === undefined || structure === undefined || custodians.length === 0) {
        throw new Error("expected <representation> <structure> <custodian> [<custodian>...]");
      }
      if (custodians.length > 4) throw new Error("a link takes 1 to 4 custodians");
      if (new Set(custodians).size !== custodians.length) {
        throw new Error("a link takes distinct custodians");
      }
      return {
        kind,
        representationId: id(rep, "representation"),
        structure: oneOf(structure, CUSTODY_STRUCTURES, "structure"),
        custodianIds: custodians.map((c) => id(c, "custodian id")),
      };
    }
    case "set-policy": {
      const p = split(rest, ["action", "tolerance-bps", "max-age-ms", "baseline-supply"]);
      const [rep] = positional(p, 1, "<representation>");
      const baseline = optional(p, "baseline-supply") ?? "0";
      if (!DECIMAL.test(baseline)) throw new Error("--baseline-supply must be a decimal integer");
      return {
        kind,
        representationId: id(rep!, "representation"),
        policy: {
          tolerance_bps: integer(optional(p, "tolerance-bps") ?? "0", "tolerance-bps", 0, 1_000),
          max_reserve_age_ms: integer(
            optional(p, "max-age-ms") ?? "86400000",
            "max-age-ms",
            60_000,
            2_592_000_000,
          ),
          action: oneOf(text(p, "action"), RESERVE_ACTIONS, "--action"),
          baseline_supply: baseline,
        },
      };
    }
    case "set-minter": {
      const [rep] = positional(split(rest, []), 1, "<representation>");
      return { kind, representationId: id(rep!, "representation") };
    }
    case "publish": {
      const skipped = takeAll(rest, "skip");
      const p = split(skipped.rest, ["interval-ms", "cover-bps", "custodian"], ["loop"]);
      positional(p, 0, "no arguments");
      const custodian = optional(p, "custodian");
      return {
        kind,
        loop: p.flags.has("loop"),
        intervalMs: integer(
          optional(p, "interval-ms") ?? String(DEFAULT_PUBLISH_INTERVAL_MS),
          "interval-ms",
          1_000,
          3_600_000,
        ),
        coverBps: integer(
          optional(p, "cover-bps") ?? String(DEFAULT_COVER_BPS),
          "cover-bps",
          0,
          MAX_COVER_BPS,
        ),
        custodianId: custodian === undefined ? null : id(custodian, "custodian id"),
        skip: [...new Set(skipped.values.map((v) => id(v, "representation")))],
      };
    }
    case "drift": {
      const p = split(rest, []);
      const [rep, bps] = positional(p, 2, "<representation> <bps|clear>");
      return {
        kind,
        representationId: id(rep!, "representation"),
        coverBps: bps === "clear" ? null : integer(bps!, "bps", 0, MAX_COVER_BPS),
      };
    }
    default:
      throw new Error(RESERVES_USAGE);
  }
}

/** `register_custodian` (registrar): always `synthetic: true`, the simulator has no other kind. */
export function registerCustodianArgs(
  command: Extract<ReservesCommand, { kind: "register-custodian" }>,
) {
  return {
    custodian: {
      id: command.id,
      name: command.name,
      jurisdiction: command.jurisdiction,
      attester_key: command.attesterKey,
      synthetic: true,
      verification_status: command.verification,
      evidence: command.evidence,
    },
  };
}

/** `link_custody` (registrar). */
export function linkCustodyArgs(command: Extract<ReservesCommand, { kind: "link" }>) {
  return {
    representation_id: command.representationId,
    structure: command.structure,
    custodian_ids: command.custodianIds,
  };
}

/** `set_reserve_policy` (owner). */
export function setReservePolicyArgs(command: Extract<ReservesCommand, { kind: "set-policy" }>) {
  return { representation_id: command.representationId, policy: command.policy };
}

/** `add_signer_key` (owner): the dev reserve-attester key, tied to an account holding the role. */
export function addSignerKeyArgs(command: Extract<ReservesCommand, { kind: "register-attester" }>) {
  return {
    role: "reserve_attester",
    account_id: command.accountId,
    public_key: devKey("reserve-attester").publicKey,
    scopes: command.scopes,
  };
}
