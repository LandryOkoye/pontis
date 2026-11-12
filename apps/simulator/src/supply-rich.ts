// Supply and trade-flow tables for the rich demo catalogue (one entry per claim in `RICH_CLAIMS`).
// Everything here is fiction. The seven original claims keep the defaults in supply.ts and flow.ts.

/** Whole tokens in circulation at the start of the simulation. Unique assets are exactly 1. */
export const RICH_START_SUPPLY_TOKENS: Readonly<Record<string, bigint>> = {
  "syn-tbill-3m": 120_000_000n,
  "syn-tbill-ladder": 35_000_000n,
  "syn-mmf-usd": 260_000_000n,
  "syn-mmf-eur": 90_000_000n,
  "syn-igcorp": 18_000_000n,
  "syn-idx-global": 6_500_000n,
  "syn-basket-tech": 3_200_000n,
  "syn-vc-fund": 40_000n,
  "syn-pe-fund": 25_000n,
  "syn-cre-office": 2_400_000n,
  "syn-cre-logistics": 1_900_000n,
  "syn-resi-rental": 5_500_000n,
  "syn-resi-flat": 1n,
  "syn-art-canvas": 1n,
  "syn-gold-kg": 420n,
  "syn-silver-oz": 900_000n,
  "syn-oil-bbl": 250_000n,
  "syn-copper-t": 8_000n,
  "syn-carbon-nature": 3_200_000n,
  "syn-carbon-eng": 180_000n,
  "syn-note-sme": 700_000n,
  "syn-note-trade": 450_000n,
  "syn-stock-quillfeather": 4_100_000n,
  "syn-stock-tarnowski": 6_800_000n,
  "syn-stock-marlowe": 900_000n,
  "syn-eur": 140_000_000n,
  "syn-jpy": 2_200_000_000n,
};

/**
 * Daily supply growth in ppm of the start. Money markets and indices take inflows; a delisted stock
 * and retired carbon credits shrink. Unique assets have no entry because they never change.
 */
export const RICH_DAILY_GROWTH_PPM: Readonly<Record<string, number>> = {
  "syn-tbill-3m": 1_500,
  "syn-tbill-ladder": 2_500,
  "syn-mmf-usd": 3_000,
  "syn-mmf-eur": 2_000,
  "syn-igcorp": 1_000,
  "syn-idx-global": 5_000,
  "syn-basket-tech": 3_500,
  "syn-vc-fund": 500,
  "syn-pe-fund": 300,
  "syn-cre-office": 400,
  "syn-cre-logistics": 800,
  "syn-resi-rental": 600,
  "syn-gold-kg": 500,
  "syn-silver-oz": 1_000,
  "syn-oil-bbl": 1_000,
  "syn-copper-t": 800,
  "syn-carbon-nature": 4_000,
  "syn-carbon-eng": -2_500,
  "syn-note-sme": 3_000,
  "syn-note-trade": 2_000,
  "syn-stock-quillfeather": 1_000,
  "syn-stock-tarnowski": 1_000,
  "syn-stock-marlowe": -3_000,
  "syn-eur": 3_000,
  "syn-jpy": 1_000,
};

/**
 * Most conversions in one hour between the wrappers of a claim (the draw is below this number).
 * Cash-like claims trade the most, private and real assets the least.
 */
export const FLOW_MAX_PER_HOUR: Readonly<Record<string, number>> = {
  "syn-tbill-3m": 7,
  "syn-tbill-ladder": 7,
  "syn-mmf-usd": 7,
  "syn-mmf-eur": 7,
  "syn-eur": 7,
  "syn-jpy": 7,
  "syn-idx-global": 5,
  "syn-basket-tech": 5,
  "syn-stock-quillfeather": 5,
  "syn-stock-tarnowski": 5,
  "syn-stock-marlowe": 5,
  "syn-igcorp": 4,
  "syn-gold-kg": 4,
  "syn-silver-oz": 4,
  "syn-oil-bbl": 4,
  "syn-copper-t": 4,
  "syn-carbon-nature": 4,
  "syn-carbon-eng": 4,
  "syn-note-sme": 3,
  "syn-note-trade": 3,
  "syn-vc-fund": 2,
  "syn-pe-fund": 2,
  "syn-cre-office": 2,
  "syn-cre-logistics": 2,
  "syn-resi-rental": 2,
  // Unique assets have one wrapper, so these never produce a trade.
  "syn-resi-flat": 2,
  "syn-art-canvas": 2,
};
