// The price feed seam (ADR 0015 section 5, expansion brief section 12.5). A real feed is another
// implementation of the same interface, added only after the research gate in ADR 0014.

import type { DataSource } from "@pontis/domain";

export interface FeedPoint {
  representationId: string;
  /** Price of one whole token at 8 decimals. */
  price: bigint;
  currency: string;
  asOfMs: number;
  source: DataSource;
  simulated: boolean;
}

export interface PriceFeed {
  /** Stable name, for logs. */
  readonly id: string;
  /** The newest point at or before `atMs`, or undefined before the series begins. */
  latest(representationId: string, atMs: number): FeedPoint | undefined;
  /** Points with `asOfMs` in `[fromMs, toMs)`, ascending, on the feed's own grid. */
  history(representationId: string, fromMs: number, toMs: number): FeedPoint[];
}

/** A NAV per token for fund-style assets; the same honesty fields as a price. */
export interface NavPoint {
  representationId: string;
  nav: bigint;
  currency: string;
  asOfMs: number;
  source: DataSource;
  simulated: boolean;
}
