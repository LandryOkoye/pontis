// The demo price relayer's pure part: from the registry on chain, the simulated feed's current
// price of each representation, signed by the dev price-publisher key, in the exact arguments of
// `submit_price` (ADR 0016 section 1). Every price is labelled `simulated_feed` / `simulated: true`
// by the feed itself; this file never changes the label.

import { devKey } from "@pontis/dev-keys";
import {
  SimulatedPriceFeed,
  feedConfigFor,
  signPoint,
  submitPriceArgs,
  type RegistryRepresentation,
} from "@pontis/market-data";

export interface PriceSubmission {
  representationId: string;
  args: ReturnType<typeof submitPriceArgs>;
}

/**
 * One submission per representation the feed can price. The feed steps every five minutes; the
 * relayer signs the price in force at `nowMs` as of `nowMs`, so the contract sees a fresh price
 * and a strictly newer one on every run. That is a simulation choice, stated here and in the
 * limitations: a real feed would sign its own observation time.
 */
export function priceSubmissions(
  registry: readonly RegistryRepresentation[],
  nowMs: number,
  contract: string,
): PriceSubmission[] {
  const feed = new SimulatedPriceFeed(feedConfigFor(registry));
  const key = devKey("price-publisher");
  const out: PriceSubmission[] = [];
  for (const id of feed.representationIds()) {
    const held = feed.latest(id, nowMs);
    if (!held) continue;
    const point = { ...held, asOfMs: nowMs };
    out.push({
      representationId: id,
      args: submitPriceArgs(point, signPoint(key, point, contract)),
    });
  }
  return out;
}
