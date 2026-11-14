// Market view model for the Markets and asset pages. It is built from the API's asset directory
// (`GET /v1/assets`) and price candles (`GET /v1/assets/{id}/charts/price`) by `market-adapter.ts`.
// A figure the API does not have for an asset is null and renders as a dash, never as zero.

export type ChartRange = "24h" | "1W" | "1M" | "1Y" | "All";
export const CHART_RANGES: ChartRange[] = ["24h", "1W", "1M", "1Y", "All"];

/** One row of the markets table. Prices are USD per whole token; changes are fractions. */
export interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  /** Value held in the test vault. */
  tvlUsd: number | null;
  /** Whole tokens in circulation. */
  circulatingSupply: number | null;
  /** Recent closes, oldest first; empty without a price. */
  sparkline: number[];
  /** True when the figures come from the labelled demo feed rather than testnet activity. */
  simulated: boolean;
  priceAsOf: string | null;
}

export interface MarketAsset extends MarketRow {
  canonicalUnitsPerToken: number;
}

export interface MarketPair {
  pair: string;
  kind: "Parity route" | "Registry only";
  priceUsd: number | null;
  /** Test vault value behind a parity route; null where there is no route. */
  depthUsd: number | null;
}

export interface ChartPoint {
  /** Unix ms. */
  t: number;
  price: number;
  /** USD value of units moved in the bucket starting at `t`. */
  volume: number;
}

export interface MarketChart {
  range: ChartRange;
  points: ChartPoint[];
}

export interface MarketDetail {
  asset: MarketAsset;
  pairs: MarketPair[];
}
