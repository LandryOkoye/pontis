// GET /v1/routes/{fromId}/{toId}/guards: the contract's guard breakdown, read live, with the
// reference prices behind it and their honesty labels. Nothing here is cached or computed locally.

import type { RouteGuardsResponse } from "@pontis/api-types";
import { formatPrice } from "@pontis/domain";
import type { Db } from "@pontis/db";
import { assertAssetsExist } from "./compare.ts";
import type { QuoteChain } from "./chain.ts";
import { checkRefusal } from "./reasons.ts";

export async function routeGuards(
  db: Db,
  chain: QuoteChain,
  fromId: string,
  toId: string,
  amount: string | undefined,
  now: Date,
): Promise<RouteGuardsResponse> {
  await assertAssetsExist(db, [fromId, toId]);
  const view = await chain.getRouteGuards(fromId, toId, amount);
  const prices: RouteGuardsResponse["prices"] = [];
  for (const id of [fromId, toId]) {
    const price = await chain.getPrice(id);
    if (!price) continue;
    prices.push({
      representationId: id,
      price: formatPrice(BigInt(price.price)),
      currency: price.currency,
      asOf: new Date(price.as_of_ms).toISOString(),
      ageMs: Math.max(0, now.getTime() - price.as_of_ms),
      source: price.source,
      simulated: price.simulated,
    });
  }
  return {
    fromId,
    toId,
    amount: amount ?? null,
    executable: view.executable,
    guarded: view.checks.some((c) => c.name === "guard" && c.passed),
    degraded: view.degraded,
    feeBps: view.fee_bps,
    skewBps: view.skew_bps,
    checks: view.checks.map((c) => {
      const reasonCode = checkRefusal(c);
      return reasonCode ? { ...c, reasonCode } : c;
    }),
    prices,
  };
}
