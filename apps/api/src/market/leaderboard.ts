// Issuers ranked by the market cap of their assets (brief section 12.1, screen 7).

import type { IssuerLeaderboard } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import { parsePrice, type DataFilter } from "@pontis/domain";
import { loadItems, type Item } from "./directory.ts";
import { sum, text } from "./overview.ts";

export async function issuerLeaderboard(db: Db, data: DataFilter): Promise<IssuerLeaderboard> {
  const groups = new Map<string, Item[]>();
  for (const item of await loadItems(db, data)) {
    groups.set(item.issuer.id, [...(groups.get(item.issuer.id) ?? []), item]);
  }
  const rows = [...groups.values()].map((members) => ({
    issuer: (members[0] as Item).issuer,
    assetCount: members.length,
    cap: sum(members.map((i) => (i.market?.marketCap ? parsePrice(i.market.marketCap) : null))),
    simulated: members.some((i) => i.market?.marketCap)
      ? members.some((i) => i.market?.marketCap && i.market.simulated)
      : null,
  }));
  rows.sort((a, b) => {
    if (a.cap === null || b.cap === null) {
      return a.cap === b.cap ? a.issuer.id.localeCompare(b.issuer.id) : a.cap === null ? 1 : -1;
    }
    return a.cap === b.cap ? a.issuer.id.localeCompare(b.issuer.id) : a.cap > b.cap ? -1 : 1;
  });
  return {
    data,
    items: rows.map((r, i) => ({
      rank: i + 1,
      issuer: r.issuer,
      assetCount: r.assetCount,
      totalMarketCap: text(r.cap),
      simulated: r.simulated,
      reliabilityScore: null,
    })),
  };
}
