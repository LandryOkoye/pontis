// Market overview reads (brief section 12.1, screen 1): global stats, movers and the category and
// chain breakdowns. All of them are computed from the same joined items as the directory, so a
// figure on the dashboard is the figure in the table.

import type { CategoryList, MarketMovers, MarketOverview, Mover } from "@pontis/api-types";
import type { Db } from "@pontis/db";
import { formatPrice, parsePrice, type DataFilter, type DataSource } from "@pontis/domain";
import { loadItems, type Item } from "./directory.ts";

const big = (v: string | null | undefined): bigint | null => (v ? parsePrice(v) : null);
export const sum = (values: (bigint | null)[]): bigint | null => {
  const known = values.filter((v): v is bigint => v !== null);
  return known.length > 0 ? known.reduce((a, b) => a + b, 0n) : null;
};
export const text = (v: bigint | null) => (v === null ? null : formatPrice(v));
export const sourcesOf = (items: readonly Item[]): DataSource[] =>
  [...new Set(items.flatMap((i) => i.market?.sources ?? []))].sort();
export const anySimulated = (items: readonly Item[]) =>
  items.some((i) => i.market?.simulated === true);

const mover = (i: Item): Mover | null =>
  i.market && {
    id: i.id,
    symbol: i.symbol,
    name: i.name,
    price: i.market.price,
    change24hBps: i.market.change24hBps,
    marketCap: i.market.marketCap,
    volume24h: i.market.volume24h,
    tvl: i.market.tvl,
    simulated: i.market.simulated,
  };

export async function marketOverview(db: Db, data: DataFilter, now: Date): Promise<MarketOverview> {
  const items = await loadItems(db, data);
  const priced = items.filter((i) => i.market);
  const caps = priced.flatMap((i) =>
    i.market?.marketCap
      ? [{ cap: parsePrice(i.market.marketCap), bps: i.market.change24hBps }]
      : [],
  );
  const weighted = caps.filter((c): c is { cap: bigint; bps: number } => c.bps !== null);
  const weight = weighted.reduce((a, c) => a + c.cap, 0n);
  return {
    data,
    asOf: now.toISOString(),
    assetCount: items.length,
    pricedAssetCount: priced.length,
    issuerCount: new Set(items.map((i) => i.issuer.id)).size,
    chainCount: new Set(items.flatMap((i) => i.chains)).size,
    convertibleAssetCount: items.filter((i) => i.convertible).length,
    totalMarketCap: text(sum(priced.map((i) => big(i.market?.marketCap)))),
    totalTvl: text(sum(priced.map((i) => big(i.market?.tvl)))),
    volume24h: formatPrice(sum(priced.map((i) => big(i.market?.volume24h))) ?? 0n),
    change24hBps:
      weight > 0n
        ? Number(weighted.reduce((a, c) => a + c.cap * BigInt(c.bps), 0n) / weight)
        : null,
    simulated: anySimulated(priced),
    sources: sourcesOf(priced),
  };
}

const compareBig = (a: bigint, b: bigint) => (a > b ? 1 : a < b ? -1 : 0);

/** The `limit` items with the largest (`desc`) or smallest (`asc`) value; items without one are left out. */
const top = (items: Item[], limit: number, by: (i: Item) => bigint | null, order: "asc" | "desc") =>
  items
    .flatMap((i) => {
      const v = by(i);
      return v === null ? [] : [{ i, v }];
    })
    .sort(
      (a, b) =>
        (order === "desc" ? -compareBig(a.v, b.v) : compareBig(a.v, b.v)) ||
        a.i.id.localeCompare(b.i.id),
    )
    .slice(0, limit)
    .flatMap(({ i }) => mover(i) ?? []);

export async function marketMovers(db: Db, data: DataFilter, limit: number): Promise<MarketMovers> {
  const items = await loadItems(db, data);
  const change = (i: Item) => {
    const bps = i.market?.change24hBps;
    return bps === null || bps === undefined ? null : BigInt(bps);
  };
  return {
    data,
    gainers: top(
      items.filter((i) => (change(i) ?? 0n) > 0n),
      limit,
      change,
      "desc",
    ),
    losers: top(
      items.filter((i) => (change(i) ?? 0n) < 0n),
      limit,
      change,
      "asc",
    ),
    topByVolume: top(items, limit, (i) => big(i.market?.volume24h), "desc"),
    topByTvl: top(items, limit, (i) => big(i.market?.tvl), "desc"),
    newlyListed: [...items]
      .sort(
        (a, b) => b.registeredAt.getTime() - a.registeredAt.getTime() || a.id.localeCompare(b.id),
      )
      .slice(0, limit)
      .map((i) => ({
        id: i.id,
        symbol: i.symbol,
        name: i.name,
        registeredAt: i.registeredAt.toISOString(),
        market: mover(i),
      })),
  };
}

export async function marketCategories(db: Db, data: DataFilter): Promise<CategoryList> {
  const items = await loadItems(db, data);
  const groups = new Map<string, Item[]>();
  for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  return {
    data,
    items: [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, members]) => ({
        category,
        assetCount: members.length,
        marketCap: text(sum(members.map((i) => big(i.market?.marketCap)))),
        volume24h: formatPrice(sum(members.map((i) => big(i.market?.volume24h))) ?? 0n),
        tvl: text(sum(members.map((i) => big(i.market?.tvl)))),
        simulated: anySimulated(members),
        sources: sourcesOf(members),
      })),
  };
}
