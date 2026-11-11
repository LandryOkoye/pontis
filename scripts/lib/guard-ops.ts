// Guard operations for the demo pairs (ADR 0016). The preset is sized for the simulated feed: its
// wrappers drift apart by a few tens of basis points, so 150 bps opens the route in normal times
// and a scripted 5 percent move closes it.

import type { RouteGuardArgs } from "./guard-types.ts";

export const DEMO_GUARD: RouteGuardArgs = {
  max_deviation_bps: 150,
  hard_deviation_bps: 500,
  trip_after: 3,
  // The relayer publishes every 30 seconds; two missed rounds close the route.
  max_price_age_ms: 90_000,
  stale_policy: "fail_closed",
  min_amount_in: "1000",
  max_amount_in: "0",
  window_ms: 0,
  max_window_amount_in: "0",
  skew_max_bps: 50,
};

export type GuardsCommand =
  | { kind: "status" }
  | { kind: "register-publisher" }
  | { kind: "set-guard"; fromId: string; toId: string }
  | { kind: "publish"; loopSeconds: number | undefined };

const USAGE =
  "usage: guards <status|register-publisher|set-guard <fromId> <toId>|publish [--loop <seconds>]>";
const ID = /^[a-z0-9]+([_.-][a-z0-9]+)*$/;

export function parseGuardsArgs(argv: string[]): GuardsCommand {
  const [kind, first, second] = argv;
  switch (kind) {
    case "status":
    case "register-publisher":
      return { kind };
    case "set-guard":
      if (!first || !second || !ID.test(first) || !ID.test(second) || first === second) {
        throw new Error("set-guard needs two different representation ids");
      }
      return { kind, fromId: first, toId: second };
    case "publish": {
      if (first === undefined) return { kind, loopSeconds: undefined };
      const seconds = Number(second);
      if (first !== "--loop" || !Number.isInteger(seconds) || seconds < 5 || seconds > 3_600) {
        throw new Error("publish takes only --loop <seconds>, from 5 to 3600");
      }
      return { kind, loopSeconds: seconds };
    }
    default:
      throw new Error(USAGE);
  }
}
