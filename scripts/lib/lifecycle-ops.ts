// Argument parsing for the lifecycle, delisting and NAV strike commands
// (docs/runbooks/corporate-actions.md). Pure, like `action-ops.ts`, which hands it the rest.

import { ASSET_KINDS, LIFECYCLE_STAGES, parseDecimalAmount } from "@pontis/domain";
import { SHA256, id, oneOf, optional, positional, split, text, type Parsed } from "./arg-parse.ts";
import { USAGE, type LifecycleCommand } from "./action-types.ts";

const HOUR_MS = 3_600_000;

function evidenceHash(p: Parsed): string | null {
  const hash = optional(p, "evidence-hash");
  if (hash !== undefined && !SHA256.test(hash)) {
    throw new Error("--evidence-hash must be 64 lowercase hex characters");
  }
  return hash ?? null;
}

export function parseLifecycleArgs(argv: string[]): LifecycleCommand {
  const [kind, ...rest] = argv;
  switch (kind) {
    case "set-stage": {
      const p = split(rest, ["note", "evidence-hash"]);
      const [representationId, to] = positional(p, 2, "<representationId> <stage>");
      const stage = oneOf(to!, LIFECYCLE_STAGES, "stage");
      if (stage === "delisted" || stage === "nav_strike_window") {
        throw new Error(
          stage === "delisted"
            ? "delisting is two steps: request-delist, then approve-delist by another account"
            : "nav_strike_window is computed from the latest strike and never set",
        );
      }
      return {
        kind,
        representationId: id(representationId!, "representation id"),
        to: stage,
        evidenceHash: evidenceHash(p),
        note: text(p, "note"),
      };
    }
    case "set-flags": {
      const p = split(rest, [], ["no-conversion", "bridge-only"]);
      const [representationId, assetKind] = positional(p, 2, "<representationId> <kind>");
      return {
        kind,
        representationId: id(representationId!, "representation id"),
        assetKind: oneOf(assetKind!, ASSET_KINDS, "kind"),
        noConversion: p.flags.has("no-conversion"),
        bridgeOnly: p.flags.has("bridge-only"),
      };
    }
    case "request-delist": {
      const p = split(rest, ["note", "evidence-hash"]);
      return {
        kind,
        representationId: id(positional(p, 1, "<representationId>")[0]!, "representation id"),
        evidenceHash: evidenceHash(p),
        note: text(p, "note"),
      };
    }
    case "approve-delist": {
      const p = split(rest, []);
      return {
        kind,
        representationId: id(positional(p, 1, "<representationId>")[0]!, "representation id"),
      };
    }
    case "nav": {
      const p = split(rest, ["nav", "window-hours"]);
      const raw = optional(p, "nav");
      const hours = Number(optional(p, "window-hours") ?? "24");
      if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
        throw new Error("--window-hours must be a whole number from 1 to 168");
      }
      let nav: bigint | undefined;
      if (raw !== undefined) {
        try {
          nav = parseDecimalAmount(raw, 8);
        } catch (error) {
          throw new Error(`--nav: ${(error as Error).message}`, { cause: error });
        }
        if (nav === 0n || nav >= 1n << 64n)
          throw new Error("--nav must be positive and below 2^64 at 8 decimals");
      }
      return {
        kind,
        representationId: id(positional(p, 1, "<representationId>")[0]!, "representation id"),
        nav,
        windowMs: hours * HOUR_MS,
      };
    }
    default:
      throw new Error(USAGE);
  }
}
