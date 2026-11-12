// Simulated market behaviour for the rich demo catalogue: one profile per extra canonical claim.
// Companion to DEFAULT_CLAIMS in profiles.ts, which stays untouched so its seeded series do not
// move. Everything here is fiction. Rates: walk drift and volatility are ppm per five-minute step
// (daily volatility is about volPpm * 17 / 10_000 percent); NAV accrual is ppb per step
// (409 ppb is about 4.3% a year). Jumps all fall inside the 90 days ending 2026-11-11.

import type { ClaimProfile, Jump } from "./series.ts";

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

/** A jump of `num / den` of the price, for example an appraisal or an announcement. */
const jump = (atMs: number, num: bigint, den: bigint, reason: string): Jump => ({
  atMs,
  num,
  den,
  reason,
});

// Premium of a wrapper over its claim: how noisy, how fast it reverts, and its clamp. Every clamp
// stays under 3.5% so a series starts close to its start price.
const FUND = { volPpm: 50, reversionPpm: 60_000, maxPpm: 3_000 };
const NOTE = { volPpm: 120, reversionPpm: 30_000, maxPpm: 12_000 };
const EQUITY = { volPpm: 300, reversionPpm: 20_000, maxPpm: 15_000 };
const COMMODITY = { volPpm: 150, reversionPpm: 30_000, maxPpm: 8_000 };
const STABLE = { volPpm: 18, reversionPpm: 100_000, maxPpm: 2_000 };
const APPRAISED = { volPpm: 80, reversionPpm: 10_000, maxPpm: 25_000 };

/** A fund or note whose NAV accrues with no noise; the market price tracks it. */
const nav = (
  id: string,
  startPrice: string,
  navAccrualPpb: number,
  premium = FUND,
): ClaimProfile => ({
  seed: id,
  startPrice,
  driftPpm: 0,
  volPpm: 0,
  navAccrualPpb,
  premium,
  jumps: [],
});

/** A random walk, with optional scheduled jumps. */
const walk = (
  id: string,
  startPrice: string,
  driftPpm: number,
  volPpm: number,
  premium: ClaimProfile["premium"],
  jumps: readonly Jump[] = [],
): ClaimProfile => ({ seed: id, startPrice, driftPpm, volPpm, premium, jumps });

/** A quote-style asset pulled hard to its target. */
const peg = (id: string, target: string): ClaimProfile => ({
  seed: id,
  startPrice: target,
  driftPpm: 0,
  volPpm: 14,
  peg: { target, reversionPpm: 100_000 },
  premium: STABLE,
  jumps: [],
});

// Appraisal and mark style claims move little between marks and step at each one.
const SEP_30 = day(2026, 9, 30);

export const RICH_CLAIMS: Readonly<Record<string, ClaimProfile>> = {
  // Treasury bill, money market and note claims: NAV accrual only.
  "syn-tbill-3m": nav("syn-tbill-3m", "1", 409),
  "syn-tbill-ladder": nav("syn-tbill-ladder", "1", 390),
  "syn-mmf-usd": nav("syn-mmf-usd", "1", 419),
  "syn-mmf-eur": nav("syn-mmf-eur", "1.085", 247),
  "syn-note-sme": nav("syn-note-sme", "100", 894, NOTE),
  "syn-note-trade": nav("syn-note-trade", "100", 590, NOTE),

  // Bond fund, index and basket claims.
  "syn-igcorp": walk("syn-igcorp", "102.4", 1, 140, { ...FUND, maxPpm: 6_000 }),
  "syn-idx-global": walk("syn-idx-global", "318.6", 2, 590, { ...EQUITY, maxPpm: 10_000 }),
  "syn-basket-tech": walk("syn-basket-tech", "76.4", 3, 960, EQUITY),

  // Metals, energy and carbon.
  "syn-gold-kg": walk("syn-gold-kg", "85300", 1, 580, COMMODITY),
  "syn-silver-oz": walk("syn-silver-oz", "31.4", 1, 1_100, COMMODITY),
  "syn-oil-bbl": walk("syn-oil-bbl", "78.6", 0, 1_300, COMMODITY, [
    jump(day(2026, 10, 8), 970n, 1_000n, "supply announcement"),
  ]),
  "syn-copper-t": walk("syn-copper-t", "9450", 1, 820, COMMODITY),
  "syn-carbon-nature": walk("syn-carbon-nature", "24.8", 2, 1_450, COMMODITY, [
    jump(day(2026, 9, 15), 1_060n, 1_000n, "registry methodology update"),
  ]),
  "syn-carbon-eng": walk("syn-carbon-eng", "310", 1, 700, COMMODITY),

  // Listed companies. Tarnowski's split is scheduled for 2026-12-01, so no jump yet.
  "syn-stock-quillfeather": walk("syn-stock-quillfeather", "63.4", 2, 1_650, EQUITY, [
    jump(day(2026, 10, 14), 930n, 1_000n, "trial readout"),
  ]),
  "syn-stock-tarnowski": walk("syn-stock-tarnowski", "38.9", 2, 700, EQUITY),
  "syn-stock-marlowe": walk("syn-stock-marlowe", "14.25", -2, 1_300, EQUITY, [
    jump(day(2026, 9, 3), 1_340n, 1_000n, "takeover offer"),
  ]),

  // Private funds and real estate: appraisal-style marks.
  "syn-vc-fund": walk("syn-vc-fund", "1420", 0, 25, APPRAISED, [
    jump(SEP_30, 1_031n, 1_000n, "mark +3.1%"),
  ]),
  "syn-pe-fund": walk("syn-pe-fund", "2015", 0, 20, APPRAISED, [
    jump(SEP_30, 988n, 1_000n, "mark -1.2%"),
  ]),
  "syn-cre-office": walk("syn-cre-office", "96.8", 0, 35, APPRAISED, [
    jump(SEP_30, 992n, 1_000n, "appraisal -0.8%"),
  ]),
  "syn-cre-logistics": walk("syn-cre-logistics", "124.5", 0, 30, APPRAISED, [
    jump(SEP_30, 1_014n, 1_000n, "appraisal +1.4%"),
  ]),
  "syn-resi-rental": walk("syn-resi-rental", "58.2", 0, 22, APPRAISED, [
    jump(SEP_30, 1_009n, 1_000n, "appraisal +0.9%"),
  ]),
  "syn-resi-flat": walk("syn-resi-flat", "640000", 0, 18, APPRAISED, [
    jump(SEP_30, 1_006n, 1_000n, "appraisal +0.6%"),
  ]),
  "syn-art-canvas": walk("syn-art-canvas", "480000", 0, 15, APPRAISED, [
    jump(day(2026, 10, 22), 1_055n, 1_000n, "auction estimate +5.5%"),
  ]),

  // Pegged currencies.
  "syn-eur": peg("syn-eur", "1.085"),
  "syn-jpy": peg("syn-jpy", "0.0066"),
};
