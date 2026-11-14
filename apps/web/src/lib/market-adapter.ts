// Turns the API's market shapes into the view model the pages render. Pure functions: the API
// sends prices as decimal strings and changes as basis points; these become display-only numbers.
import type { AssetDirectoryItem, Compatibility, PriceChart } from "@pontis/api-types";
import type { CandleInterval } from "@pontis/domain";
import { rationalFromWire } from "@pontis/domain";
import type {
  ChartRange,
  MarketChart,
  MarketDetail,
  MarketPair,
  MarketRow,
} from "./market-types.ts";

const DAY_MS = 86_400_000;

const number = (text: string | null | undefined): number | null =>
  text === null || text === undefined ? null : Number(text);
const fraction = (bps: number | null | undefined): number | null =>
  bps === null || bps === undefined ? null : bps / 10_000;

export function toMarketRow(item: AssetDirectoryItem): MarketRow {
  const market = item.market;
  return {
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    priceUsd: number(market?.price),
    change24h: fraction(market?.change24hBps),
    change7d: fraction(market?.change7dBps),
    marketCapUsd: number(market?.marketCap),
    volume24hUsd: number(market?.volume24h),
    tvlUsd: number(market?.tvl),
    circulatingSupply: market?.supply ? Number(market.supply) / 10 ** item.decimals : null,
    sparkline: item.sparkline?.points.map(Number) ?? [],
    simulated: market?.simulated ?? false,
    priceAsOf: market?.priceAsOf ?? null,
  };
}

export const toMarketRows = (items: readonly AssetDirectoryItem[]): MarketRow[] =>
  items.map(toMarketRow);

/** Canonical units one whole token stands for, from the registry's unit multiplier. */
function canonicalUnitsPerToken(item: AssetDirectoryItem): number {
  const multiplier = rationalFromWire(item.unitMultiplier);
  return Number(10n ** BigInt(item.decimals) * multiplier.num) / Number(multiplier.den) || 1;
}

/** One asset's figures and its recorded counterparts. Undefined when the asset is not listed. */
export function toMarketDetail(
  items: readonly AssetDirectoryItem[],
  id: string,
  relations: readonly Compatibility[],
): MarketDetail | undefined {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return undefined;
  const row = toMarketRow(item);
  const pairs = relations.flatMap((relation): MarketPair[] => {
    const other = items.find((candidate) => candidate.id === relation.counterpartId);
    if (!other) return [];
    return [
      {
        pair: `${item.symbol} / ${other.symbol}`,
        kind: relation.parityEnabled ? "Parity route" : "Registry only",
        priceUsd: row.priceUsd,
        depthUsd: relation.parityEnabled ? row.tvlUsd : null,
      },
    ];
  });
  return { asset: { ...row, canonicalUnitsPerToken: canonicalUnitsPerToken(item) }, pairs };
}

/** Candle size and look-back for each range. `All` takes the API's default window. */
const RANGE: Record<ChartRange, { interval: CandleInterval; days: number | null }> = {
  "24h": { interval: "15m", days: 1 },
  "1W": { interval: "1h", days: 7 },
  "1M": { interval: "4h", days: 30 },
  "1Y": { interval: "1d", days: 365 },
  All: { interval: "1d", days: null },
};

/** Query string for `GET /v1/assets/{id}/charts/price`. */
export function chartQuery(range: ChartRange, now = Date.now()): string {
  const { interval, days } = RANGE[range];
  const params = new URLSearchParams({ interval });
  if (days !== null) params.set("from", new Date(now - days * DAY_MS).toISOString());
  return params.toString();
}

export function toMarketChart(range: ChartRange, chart: PriceChart): MarketChart {
  return {
    range,
    points: chart.points.map((point) => ({
      t: Date.parse(point.t),
      price: Number(point.close),
      volume: Number(point.volumeQuote),
    })),
  };
}
