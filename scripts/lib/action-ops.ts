// Argument parsing for the corporate action commands, and the entry point for every command
// (docs/runbooks/corporate-actions.md). Pure: no chain, no clock, so it is tested directly.

import { ACTION_KINDS } from "@pontis/domain";
import {
  SHA256,
  id,
  oneOf,
  optional,
  parseRatio,
  parseTime,
  positional,
  split,
  text,
} from "./arg-parse.ts";
import type { ActionsCommand } from "./action-types.ts";
import { parseLifecycleArgs } from "./lifecycle-ops.ts";

const ACTION_ID = /^[a-z0-9]+([_.-][a-z0-9]+)*-[0-9]+$/;

function actionId(value: string): string {
  if (!ACTION_ID.test(value)) throw new Error("action id looks like tstock-3 (asset id, dash, n)");
  return value;
}

export function parseActionsArgs(argv: string[]): ActionsCommand {
  const [kind, ...rest] = argv;
  switch (kind) {
    case "propose": {
      const p = split(rest, [
        "announced",
        "ex-date",
        "effective",
        "freeze-from",
        "freeze-until",
        "multiplier",
      ]);
      const [assetId, actionKind] = positional(p, 2, "<assetId> <kind>");
      const t = (name: string) => parseTime(text(p, name), name);
      const announcedAtMs = t("announced");
      const exDateMs = t("ex-date");
      const effectiveMs = t("effective");
      const freezeFromMs = t("freeze-from");
      const freezeUntilMs = t("freeze-until");
      if (announcedAtMs > freezeFromMs)
        throw new Error("--announced must not be after --freeze-from");
      if (!(freezeFromMs <= effectiveMs && effectiveMs <= freezeUntilMs)) {
        throw new Error(
          "the freeze window (--freeze-from to --freeze-until) must contain --effective",
        );
      }
      const change = optional(p, "multiplier");
      return {
        kind,
        assetId: id(assetId!, "asset id"),
        actionKind: oneOf(actionKind!, ACTION_KINDS, "kind"),
        announcedAtMs,
        exDateMs,
        effectiveMs,
        freezeFromMs,
        freezeUntilMs,
        multiplierChange: change === undefined ? null : parseRatio(change, "multiplier"),
      };
    }
    case "add-evidence": {
      const p = split(rest, ["uri", "sha256", "description", "provenance"]);
      const [action] = positional(p, 1, "<actionId>");
      const sha256 = text(p, "sha256");
      if (!SHA256.test(sha256)) throw new Error("--sha256 must be 64 lowercase hex characters");
      return {
        kind,
        actionId: actionId(action!),
        uri: text(p, "uri"),
        sha256,
        provenance: oneOf(
          optional(p, "provenance") ?? "issuer_provided",
          ["issuer_provided", "third_party_attested"],
          "--provenance",
        ),
        description: text(p, "description"),
      };
    }
    case "approve": {
      const p = split(rest, ["rationale"]);
      return {
        kind,
        actionId: actionId(positional(p, 1, "<actionId>")[0]!),
        rationale: text(p, "rationale"),
      };
    }
    case "cancel": {
      const p = split(rest, ["reason"]);
      return {
        kind,
        actionId: actionId(positional(p, 1, "<actionId>")[0]!),
        reason: text(p, "reason"),
      };
    }
    case "apply": {
      const p = split(rest, ["multiplier"]);
      const [action, representationId] = positional(p, 2, "<actionId> <representationId>");
      const multiplier = optional(p, "multiplier");
      return {
        kind,
        actionId: actionId(action!),
        representationId: id(representationId!, "representation id"),
        newMultiplier: multiplier === undefined ? null : parseRatio(multiplier, "multiplier"),
      };
    }
    case "settle": {
      const p = split(rest, []);
      return { kind, actionId: actionId(positional(p, 1, "<actionId>")[0]!) };
    }
    default:
      return parseLifecycleArgs(argv);
  }
}
