// The commands of the `actions` CLI as parsed from argv (docs/runbooks/corporate-actions.md).

import type { ActionKind, AssetKind, LifecycleStage } from "@pontis/domain";
import type { RatioArg } from "./arg-parse.ts";

export type EvidenceProvenance = "issuer_provided" | "third_party_attested";

export type CorporateCommand =
  | {
      kind: "propose";
      assetId: string;
      actionKind: ActionKind;
      announcedAtMs: number;
      exDateMs: number;
      effectiveMs: number;
      freezeFromMs: number;
      freezeUntilMs: number;
      multiplierChange: RatioArg | null;
    }
  | {
      kind: "add-evidence";
      actionId: string;
      uri: string;
      sha256: string;
      provenance: EvidenceProvenance;
      description: string;
    }
  | { kind: "approve"; actionId: string; rationale: string }
  | { kind: "cancel"; actionId: string; reason: string }
  | { kind: "apply"; actionId: string; representationId: string; newMultiplier: RatioArg | null }
  | { kind: "settle"; actionId: string };

export type LifecycleCommand =
  | {
      kind: "set-stage";
      representationId: string;
      to: LifecycleStage;
      evidenceHash: string | null;
      note: string;
    }
  | {
      kind: "set-flags";
      representationId: string;
      assetKind: AssetKind;
      noConversion: boolean;
      bridgeOnly: boolean;
    }
  | { kind: "request-delist"; representationId: string; evidenceHash: string | null; note: string }
  | { kind: "approve-delist"; representationId: string }
  | {
      kind: "nav";
      representationId: string;
      /** NAV per whole token at 8 decimals; undefined means the simulated feed's NAV. */
      nav: bigint | undefined;
      windowMs: number;
    };

export type ActionsCommand = CorporateCommand | LifecycleCommand;

export const USAGE = `usage: actions <command>
  propose <assetId> <kind> --announced T --ex-date T --effective T --freeze-from T --freeze-until T [--multiplier num/den]
  add-evidence <actionId> --uri U --sha256 HEX --description TEXT [--provenance issuer_provided|third_party_attested]
  approve <actionId> --rationale TEXT        cancel <actionId> --reason TEXT
  apply <actionId> <representationId> [--multiplier num/den]        settle <actionId>
  set-stage <representationId> <stage> --note TEXT [--evidence-hash HEX]
  set-flags <representationId> <kind> [--no-conversion] [--bridge-only]
  request-delist <representationId> --note TEXT [--evidence-hash HEX]        approve-delist <representationId>
  nav <representationId> [--nav 1.2345] [--window-hours 1-168]
  T is epoch milliseconds or an ISO 8601 date such as 2026-11-20T14:30:00Z`;
