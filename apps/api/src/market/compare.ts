// Compare representations (brief section 12.1, screen 4): price, NAV, premium to NAV, and for
// assets of one claim the market ratio against the registry's parity ratio.

import type { CompareResponse } from "@pontis/api-types";
import { assetRepresentations, navPoints, type Db } from "@pontis/db";
import { PRICE_SCALE, changeBps, formatPrice, parsePrice, type DataFilter } from "@pontis/domain";
import { desc, inArray } from "drizzle-orm";
import { AppError } from "../errors.ts";
import { loadItems } from "./directory.ts";

type Unit = { num: bigint; den: bigint; decimals: number };

/** `to` tokens one `from` token is worth by unit definitions, at 8 decimals, floored. */
const parityScaled = (from: Unit, to: Unit): bigint =>
  (from.num * 10n ** BigInt(from.decimals) * to.den * PRICE_SCALE) /
  (from.den * to.num * 10n ** BigInt(to.decimals));

export async function compareAssets(
  db: Db,
  ids: string[],
  data: DataFilter,
): Promise<CompareResponse> {
  const found = await loadItems(db, data, ids);
  const missing = ids.filter((id) => !found.some((i) => i.id === id));
  if (missing.length > 0) {
    throw new AppError("NOT_FOUND", 404, `Asset not found: ${missing.join(", ")}`);
  }
  // In the order the caller asked for, each asset once.
  const items = [...new Set(ids)].map((id) => found.find((i) => i.id === id)!);
  const units = new Map(
    (await db.select().from(assetRepresentations).where(inArray(assetRepresentations.id, ids))).map(
      (r) => [
        r.id,
        {
          num: BigInt(r.unitMultiplierNum),
          den: BigInt(r.unitMultiplierDen),
          decimals: r.decimals,
        },
      ],
    ),
  );
  const navRows = await db
    .select()
    .from(navPoints)
    .where(inArray(navPoints.representationId, ids))
    .orderBy(desc(navPoints.ts));
  const navOf = (id: string, simulated: boolean | undefined) =>
    navRows.find((n) => n.representationId === id && n.simulated === simulated)?.nav;

  const compared = items.map((i) => {
    const nav = navOf(i.id, i.simulatedClass);
    const price = i.market ? parsePrice(i.market.price) : null;
    return {
      id: i.id,
      symbol: i.symbol,
      name: i.name,
      canonicalAssetId: i.canonicalAssetId,
      issuer: i.issuer,
      status: i.status,
      verificationStatus: i.verificationStatus,
      chains: i.chains,
      convertible: i.convertible,
      bridgeable: i.bridgeable,
      market: i.market,
      navPerToken: nav ? formatPrice(parsePrice(nav)) : null,
      premiumToNavBps: nav && price !== null ? changeBps(parsePrice(nav), price) : null,
    };
  });

  const pairs: CompareResponse["pairs"] = [];
  for (const from of items) {
    for (const to of items) {
      if (from.id === to.id || from.canonicalAssetId !== to.canonicalAssetId) continue;
      const parity = parityScaled(units.get(from.id) as Unit, units.get(to.id) as Unit);
      // A ratio of a real price to a simulated one compares nothing, so it is withheld.
      const like =
        from.market && to.market && from.market.simulated === to.market.simulated
          ? [from.market, to.market]
          : null;
      const implied = like
        ? (parsePrice(like[0]!.price) * PRICE_SCALE) / parsePrice(like[1]!.price)
        : null;
      pairs.push({
        fromId: from.id,
        toId: to.id,
        parityRatio: formatPrice(parity),
        impliedRatio: implied === null ? null : formatPrice(implied),
        deviationBps:
          implied !== null && parity > 0n ? Number(((implied - parity) * 10_000n) / parity) : null,
        simulated: like ? like[0]!.simulated : null,
      });
    }
  }
  return { data, items: compared, pairs };
}
