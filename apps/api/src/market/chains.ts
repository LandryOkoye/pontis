// Chain breakdown of the market (brief section 12.1, screen 1): supply per chain, valued at each
// asset's price from the same data class as its other figures.

import type { ChainList } from "@pontis/api-types";
import { assetRepresentations, supplySnapshots, type Db } from "@pontis/db";
import { parsePrice, type DataFilter } from "@pontis/domain";
import { valueAt } from "@pontis/market-data";
import { inArray } from "drizzle-orm";
import { loadItems, type Item } from "./directory.ts";
import { anySimulated, sourcesOf, sum, text } from "./overview.ts";

export async function marketChains(db: Db, data: DataFilter): Promise<ChainList> {
  const items = await loadItems(db, data);
  const reps = await db
    .select({ id: assetRepresentations.id, decimals: assetRepresentations.decimals })
    .from(assetRepresentations);
  const decimals = new Map(reps.map((r) => [r.id, r.decimals]));
  const snapshots = items.length
    ? await db
        .select()
        .from(supplySnapshots)
        .where(
          inArray(
            supplySnapshots.representationId,
            items.map((i) => i.id),
          ),
        )
    : [];
  const priceOf = new Map(items.map((i) => [i.id, i]));
  // Latest snapshot per (asset, chain), from the same class as the asset's figures.
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const item = priceOf.get(s.representationId);
    if (item?.simulatedClass !== undefined && s.simulated !== item.simulatedClass) continue;
    const key = `${s.representationId}\n${s.chain}`;
    const held = latest.get(key);
    if (!held || s.ts > held.ts) latest.set(key, s);
  }
  const chains = new Map<
    string,
    { id: string; supply: string; value: bigint | null; item: Item }[]
  >();
  for (const i of items) for (const c of i.chains) if (!chains.has(c)) chains.set(c, []);
  for (const s of latest.values()) {
    const item = priceOf.get(s.representationId) as Item;
    const price = item.market ? parsePrice(item.market.price) : null;
    chains.set(s.chain, [
      ...(chains.get(s.chain) ?? []),
      {
        id: s.representationId,
        supply: s.supply,
        value:
          price === null
            ? null
            : valueAt(BigInt(s.supply), decimals.get(s.representationId) ?? 0, price),
        item,
      },
    ]);
  }
  return {
    data,
    items: [...chains]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chain, rows]) => {
        const members = items.filter(
          (i) => i.chains.includes(chain) || rows.some((r) => r.id === i.id),
        );
        return {
          chain,
          assetCount: members.length,
          value: text(sum(rows.map((r) => r.value))),
          supplies: rows
            .map((r) => ({ id: r.id, supply: r.supply }))
            .sort((a, b) => a.id.localeCompare(b.id)),
          simulated: anySimulated(members),
          sources: sourcesOf(members),
        };
      }),
  };
}
