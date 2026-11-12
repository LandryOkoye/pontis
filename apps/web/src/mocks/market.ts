// Deterministic synthetic market data for mock mode. Seeded per asset so reloads and tests see the
// same chart. None of this exists in the protocol: it stands in for a future market-data service.
import type { Asset } from "@pontis/api-types";
import { rationalFromWire } from "@pontis/domain";
import type {
  ChartPoint,
  ChartRange,
  MarketAsset,
  MarketChart,
  MarketDetail,
  MarketPair,
  MarketRow,
} from "../lib/market-types.ts";

const STEP_MS = 15 * 60_000;
const STEPS_PER_DAY = 96;
const MASTER_DAYS = 730;
const MASTER_LEN = STEPS_PER_DAY * MASTER_DAYS;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(2 * Math.PI * r());

interface Master {
  /** Aligned to the 15 minute grid; index MASTER_LEN-1 is "now". */
  price: Float64Array;
  volume: Float64Array;
  end: number;
}

const masters = new Map<string, Master>();

/** Reference USD price per canonical unit of the fictional underlying. */
export function underlyingPrice(asset: Asset): number {
  return /silver/i.test(asset.canonicalAsset.name) ? 48.2 : 4042.64;
}

export function canonicalPerToken(asset: Asset): number {
  const m = rationalFromWire(asset.unitMultiplier);
  return Number(10n ** BigInt(asset.decimals) * m.num) / Number(m.den) || 1;
}

function master(asset: Asset): Master {
  const cached = masters.get(asset.id);
  const end = Math.floor(Date.now() / STEP_MS) * STEP_MS;
  if (cached && end - cached.end < 6 * 3600_000) return cached;
  const r = rng(hash(asset.id));
  const spot = underlyingPrice(asset) * canonicalPerToken(asset);
  // Tokens trade a hair off their underlying; the offset is stable per token.
  const premium = 1 + (r() - 0.5) * 0.008;
  const price = new Float64Array(MASTER_LEN);
  const volume = new Float64Array(MASTER_LEN);
  const cap = circulating(asset) * spot;
  const dayVolume = cap * (0.006 + r() * 0.01);
  price[MASTER_LEN - 1] = spot * premium;
  for (let i = MASTER_LEN - 1; i > 0; i--) {
    const z = gauss(r);
    // Walking backwards: a small positive drift forward means older prices are lower.
    const prev = (price[i] as number) * Math.exp(-0.0007 * z - 0.0000045);
    price[i - 1] = prev;
    const move = Math.abs(z);
    volume[i] = (dayVolume / STEPS_PER_DAY) * (0.35 + r() * 1.1) * (1 + move * 0.5);
  }
  volume[0] = dayVolume / STEPS_PER_DAY;
  const built = { price, volume, end };
  masters.set(asset.id, built);
  return built;
}

export function circulating(asset: Asset): number {
  const r = rng(hash(`${asset.id}:supply`));
  return Math.round(120_000 + r() * 800_000);
}

const RANGE_STEPS: Record<ChartRange, { steps: number; stride: number }> = {
  "24h": { steps: STEPS_PER_DAY, stride: 1 },
  "1W": { steps: STEPS_PER_DAY * 7, stride: 3 },
  "1M": { steps: STEPS_PER_DAY * 30, stride: 10 },
  "1Y": { steps: STEPS_PER_DAY * 365, stride: 120 },
  All: { steps: MASTER_LEN, stride: 240 },
};

export function chart(asset: Asset, range: ChartRange): MarketChart {
  const m = master(asset);
  const { steps, stride } = RANGE_STEPS[range];
  const first = MASTER_LEN - steps;
  const points: ChartPoint[] = [];
  for (let i = first + stride - 1; i < MASTER_LEN; i += stride) {
    let volume = 0;
    for (let k = i - stride + 1; k <= i; k++) volume += m.volume[k] as number;
    points.push({ t: m.end - (MASTER_LEN - 1 - i) * STEP_MS, price: m.price[i] as number, volume });
  }
  return { range, points };
}

export function row(asset: Asset): MarketRow {
  const m = master(asset);
  const last = m.price[MASTER_LEN - 1] as number;
  const at = (back: number) => m.price[MASTER_LEN - 1 - back] as number;
  let vol = 0;
  for (let k = MASTER_LEN - STEPS_PER_DAY; k < MASTER_LEN; k++) vol += m.volume[k] as number;
  const sparkline: number[] = [];
  for (let d = 6; d >= 0; d--) sparkline.push(at(d * STEPS_PER_DAY));
  return {
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    priceUsd: last,
    change24h: last / at(STEPS_PER_DAY) - 1,
    change7d: last / at(STEPS_PER_DAY * 7) - 1,
    marketCapUsd: last * circulating(asset),
    volume24hUsd: vol,
    sparkline,
  };
}

export function detail(asset: Asset, counterparts: Asset[], parityIds: Set<string>): MarketDetail {
  const m = master(asset);
  const base = row(asset);
  const supply = circulating(asset);
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = MASTER_LEN - STEPS_PER_DAY * 365; k < MASTER_LEN; k += 8) {
    const p = m.price[k] as number;
    if (p > hi) hi = p;
    if (p < lo) lo = p;
  }
  const r = rng(hash(`${asset.id}:meta`));
  const vault =
    Number(BigInt(asset.vaultInventory) / 10n ** BigInt(Math.max(0, asset.decimals - 2))) / 100;
  const full: MarketAsset = {
    ...base,
    fdvUsd: base.priceUsd * supply * 1.12,
    tvlUsd: vault * base.priceUsd,
    volumeToMarketCap: base.volume24hUsd / base.marketCapUsd,
    circulatingSupply: supply,
    totalSupply: Math.round(supply * 1.06),
    maxSupply: null,
    holders: Math.round(180 + r() * 4200),
    high52w: hi,
    low52w: lo,
    underlyingUsd: underlyingPrice(asset),
    canonicalUnitsPerToken: canonicalPerToken(asset),
    listedAt: "2026-11-07T18:00:00.000Z",
  };
  const split = rng(hash(`${asset.id}:pairs`));
  const shares = counterparts.map(() => 0.3 + split());
  const sum = shares.reduce((a, b) => a + b, 0) || 1;
  const pairs: MarketPair[] = counterparts.map((other, i) => {
    const share = (shares[i] as number) / sum;
    return {
      venue: "Pontis Test Vault",
      pair: `${asset.symbol} / ${other.symbol}`,
      kind: parityIds.has(other.id) ? "Parity route" : "Registry only",
      priceUsd: base.priceUsd,
      volume24hUsd: parityIds.has(other.id) ? base.volume24hUsd * share : 0,
      volumeShare: parityIds.has(other.id) ? share : 0,
      depthUsd: parityIds.has(other.id) ? full.tvlUsd : 0,
    };
  });
  return { asset: full, pairs };
}
