// The asset directory (brief section 12.1, screen 2): search, filter, sort and page over every
// representation with its latest market figures. Filtering and sorting run in memory over the
// joined rows, which is right for a catalogue of up to a few thousand assets; the joins and the
// search are indexed, so revisit only if the catalogue grows past that.

import type { AssetDirectoryItem, ListAssetsQuery } from "@pontis/api-types";
import {
  assetMarketStats,
  assetProfiles,
  assetRepresentations,
  assetSearch,
  candles,
  canonicalAssets,
  compatibilityRelationships,
  issuers,
  type Db,
} from "@pontis/db";
import { parsePrice } from "@pontis/domain";
import { and, asc, eq, gte, ilike, inArray } from "drizzle-orm";
import { assetSummary } from "../catalog/asset-mappers.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { pickStats, priceText, toSnapshot, type StatsRow } from "./snapshot.ts";

const WEEK_MS = 7 * 86_400_000;

type Item = AssetDirectoryItem & { simulatedClass: boolean | undefined };

const nullableBps = (v: number | null | undefined) =>
  v === null || v === undefined ? null : BigInt(v);

const escapeLike = (token: string) => token.replace(/[\\%_]/g, "\\$&");

/** The value a sort key reads from an item; null sorts last whichever way the order points. */
function sortValue(
  item: AssetDirectoryItem,
  sort: ListAssetsQuery["sort"],
): bigint | string | null {
  const m = item.market;
  switch (sort) {
    case "id":
      return item.id;
    case "name":
      return item.name.toLowerCase();
    case "price":
      return m ? parsePrice(m.price) : null;
    case "marketCap":
      return m?.marketCap ? parsePrice(m.marketCap) : null;
    case "tvl":
      return m?.tvl ? parsePrice(m.tvl) : null;
    case "volume24h":
      return m ? parsePrice(m.volume24h) : null;
    case "change24h":
      return nullableBps(m?.change24hBps);
    case "change7d":
      return nullableBps(m?.change7dBps);
    case "change30d":
      return nullableBps(m?.change30dBps);
  }
}

function compare(a: AssetDirectoryItem, b: AssetDirectoryItem, q: ListAssetsQuery): number {
  const x = sortValue(a, q.sort);
  const y = sortValue(b, q.sort);
  if (x === null || y === null) {
    if (x === y) return a.id.localeCompare(b.id);
    return x === null ? 1 : -1;
  }
  const order = x < y ? -1 : x > y ? 1 : 0;
  return order === 0 ? a.id.localeCompare(b.id) : q.order === "asc" ? order : -order;
}

export async function listDirectory(db: Db, q: ListAssetsQuery, now: Date) {
  let searchIds: string[] | undefined;
  if (q.q) {
    const tokens = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = await db
      .select({ id: assetSearch.representationId })
      .from(assetSearch)
      .where(and(...tokens.map((t) => ilike(assetSearch.document, `%${escapeLike(t)}%`))));
    searchIds = hits.map((h) => h.id);
  }
  const rows = await db
    .select({
      rep: assetRepresentations,
      claim: canonicalAssets,
      issuer: issuers,
      profile: assetProfiles,
    })
    .from(assetRepresentations)
    .innerJoin(canonicalAssets, eq(canonicalAssets.id, assetRepresentations.canonicalAssetId))
    .innerJoin(issuers, eq(issuers.id, assetRepresentations.issuerId))
    .leftJoin(assetProfiles, eq(assetProfiles.representationId, assetRepresentations.id))
    .where(searchIds ? inArray(assetRepresentations.id, searchIds) : undefined)
    .orderBy(asc(assetRepresentations.id));
  const stats = rows.length
    ? await db
        .select()
        .from(assetMarketStats)
        .where(
          inArray(
            assetMarketStats.representationId,
            rows.map((r) => r.rep.id),
          ),
        )
    : [];
  const byRep = new Map<string, StatsRow[]>();
  for (const s of stats)
    byRep.set(s.representationId, [...(byRep.get(s.representationId) ?? []), s]);
  const related = new Set(
    (
      await db
        .select()
        .from(compatibilityRelationships)
        .where(
          and(
            eq(compatibilityRelationships.status, "approved"),
            eq(compatibilityRelationships.classification, "DIRECT_EQUIVALENT"),
          ),
        )
    ).flatMap((r) => [r.representationAId, r.representationBId]),
  );

  const items: Item[] = rows.map(({ rep, claim, issuer, profile }) => {
    const row = pickStats(byRep.get(rep.id) ?? [], q.data);
    return {
      ...assetSummary(rep, claim, issuer),
      category: claim.category,
      tags: profile?.tags ?? [],
      chains: [...new Set(profile?.chains.map((c) => c.chain) ?? ["near-testnet"])],
      // Convertible means an approved parity relationship exists and the dossier does not forbid it.
      convertible: related.has(rep.id) && (profile?.convertible ?? true),
      bridgeable: profile?.bridgeable ?? false,
      market: row ? toSnapshot(row) : null,
      sparkline: null,
      simulatedClass: row?.simulated,
    };
  });

  const wanted = items
    .filter((i) => !q.category || i.category === q.category)
    .filter((i) => !q.issuerId || i.issuer.id === q.issuerId)
    .filter((i) => !q.chain || i.chains.includes(q.chain))
    .filter((i) => !q.verification || i.verificationStatus === q.verification)
    .filter((i) => !q.status || i.status === q.status)
    .filter((i) => !q.convertible || i.convertible === (q.convertible === "true"))
    .filter((i) => !q.bridgeable || i.bridgeable === (q.bridgeable === "true"))
    .sort((a, b) => compare(a, b, q));

  const { cursor, limit, ...identity } = q;
  const offset = cursor ? decodeCursor(cursor, identity) : 0;
  const page = wanted.slice(offset, offset + limit);
  const sparks = await sparklines(db, page, now);
  return {
    items: page.map(({ simulatedClass: _class, ...item }) => ({
      ...item,
      sparkline: sparks.get(item.id) ?? null,
    })),
    nextCursor: offset + limit < wanted.length ? encodeCursor(offset + limit, identity) : null,
    total: wanted.length,
  };
}

/** Seven days of four-hour closes for each item, from the data class its market figures use. */
async function sparklines(db: Db, page: readonly Item[], now: Date) {
  const priced = page.filter((i) => i.simulatedClass !== undefined);
  const out = new Map<string, NonNullable<AssetDirectoryItem["sparkline"]>>();
  if (priced.length === 0) return out;
  const rows = await db
    .select()
    .from(candles)
    .where(
      and(
        inArray(
          candles.representationId,
          priced.map((i) => i.id),
        ),
        eq(candles.interval, "4h"),
        gte(candles.bucketStart, new Date(now.getTime() - WEEK_MS)),
      ),
    )
    .orderBy(asc(candles.bucketStart));
  for (const item of priced) {
    const closes = rows
      .filter((r) => r.representationId === item.id && r.simulated === item.simulatedClass)
      .map((r) => priceText(r.close));
    if (closes.length > 0) {
      out.set(item.id, {
        interval: "4h",
        points: closes,
        simulated: item.simulatedClass === true,
      });
    }
  }
  return out;
}
