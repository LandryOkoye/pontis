// Route-guard presets for approved catalogue pairs (ADR 0016). Each is sized for the simulated
// feed: wrappers of one claim drift apart by tens of basis points, and a claim's own volatility
// does not matter to a same-claim pair, so the presets differ in how much premium they tolerate.
// None sets a window limit: window amounts are in smallest units, which differ by wrapper decimals.

import { DEMO_GUARD } from "./guard-ops.ts";
import type { RouteGuardArgs } from "./guard-types.ts";
import type { GuardPreset } from "./catalogue.ts";

const preset = (maxDeviationBps: number, hardDeviationBps: number, skewMaxBps: number) =>
  ({
    ...DEMO_GUARD,
    max_deviation_bps: maxDeviationBps,
    hard_deviation_bps: hardDeviationBps,
    skew_max_bps: skewMaxBps,
  }) satisfies RouteGuardArgs;

export const GUARD_PRESETS: Readonly<Record<GuardPreset, RouteGuardArgs>> = {
  // NAV funds and money-market funds: wrappers should price within a few tens of basis points.
  fund: preset(50, 200, 25),
  // Stable-value tokens: the tightest guard, a fraction of a percent.
  stable: preset(25, 100, 25),
  equity: preset(300, 1_000, 75),
  commodity: preset(250, 800, 75),
  // Appraisal-priced or thinly traded claims: wide bands, a larger fee skew.
  illiquid: preset(400, 1_500, 100),
};
