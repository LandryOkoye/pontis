// A simulated NAV strike for a `nav_fund`, signed by the dev price-publisher key, in the exact
// arguments of `submit_nav_strike` (ADR 0018 section 4). Always `simulated: true` and labelled
// `simulated_feed` like every simulated price: this file never changes the label.

import { devKey } from "@pontis/dev-keys";
import {
  SimulatedPriceFeed,
  feedConfigFor,
  submitNavStrikeArgs,
  type RegistryRepresentation,
} from "@pontis/market-data";

const FEED_LOOKBACK_MS = 10 * 60_000;

/**
 * The strike for `representationId`: the feed's NAV in force at `nowMs` unless `nav` is given
 * (8 decimals), as of `nowMs`, open until `nowMs + windowMs`. Throws if there is no NAV to sign.
 */
export function navSubmission(
  registry: readonly RegistryRepresentation[],
  representationId: string,
  nowMs: number,
  contract: string,
  windowMs: number,
  nav?: bigint,
): ReturnType<typeof submitNavStrikeArgs> {
  const feed = new SimulatedPriceFeed(feedConfigFor(registry));
  const held = feed.navHistory(representationId, nowMs - FEED_LOOKBACK_MS, nowMs + 1).at(-1);
  const base = nav === undefined ? held : { ...(held ?? defaultPoint(representationId)), nav };
  if (!base) {
    throw new Error(`the simulated feed has no NAV for ${representationId}; pass --nav`);
  }
  return submitNavStrikeArgs(
    { ...base, asOfMs: nowMs, cutoffMs: nowMs + windowMs, simulated: true },
    devKey("price-publisher"),
    contract,
  );
}

function defaultPoint(representationId: string) {
  return {
    representationId,
    nav: 0n,
    currency: "USD",
    asOfMs: 0,
    source: "simulated_feed" as const,
    simulated: true,
  };
}
