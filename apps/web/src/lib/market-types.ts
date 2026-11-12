// Market data shapes. The Pontis API has no price or volume endpoints yet (see
// BACKEND-REQUESTS.md §6), so these are served by the mock API only and every screen that shows
// them says "synthetic". The shapes are what the real endpoints should return.

export type ChartRange = "24h" | "1W" | "1M" | "1Y" | "All";
export const CHART_RANGES: ChartRange[] = ["24h", "1W", "1M", "1Y", "All"];

/** One row of the markets table. Prices are USD per whole token. */
export interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  change7d: number;
  marketCapUsd: number;
  volume24hUsd: number;
  /** 7 daily closes, oldest first. */
  sparkline: number[];
}

/** Full metadata for the asset page. */
export interface MarketAsset extends MarketRow {
  fdvUsd: number;
  tvlUsd: number;
  volumeToMarketCap: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  holders: number;
  high52w: number;
  low52w: number;
  /** Reference spot price of the fictional underlying, per canonical unit. */
  underlyingUsd: number;
  canonicalUnitsPerToken: number;
  listedAt: string;
}

export interface MarketPair {
  venue: string;
  pair: string;
  kind: "Parity route" | "Registry only";
  priceUsd: number;
  volume24hUsd: number;
  volumeShare: number;
  depthUsd: number;
}

export interface ChartPoint {
  /** Unix ms. */
  t: number;
  price: number;
  /** USD traded in the bucket ending at `t`. */
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
