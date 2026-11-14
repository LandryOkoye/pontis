// Deterministic simulated market data for mock mode, served in the API's own shapes (the asset
// directory's `market` and `sparkline`, and price candles). Seeded per asset so reloads and tests
// see the same chart.
import type { Asset, AssetDirectoryItem, AssetSummary, PriceChart } from "@pontis/api-types";
import type { CandleInterval } from "@pontis/domain";
import { rationalFromWire } from "@pontis/domain";

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

/** Mock candles exist on these grids; each maps a candle interval to a look-back and a stride. */
const WINDOWS: { interval: CandleInterval; days: number; stride: number }[] = [
  { interval: "15m", days: 1, stride: 1 },
  { interval: "1h", days: 7, stride: 4 },
  { interval: "4h", days: 30, stride: 16 },
  { interval: "1d", days: 365, stride: 96 },
];

/** `GET /v1/assets/{id}/charts/price`. Without `from`, daily candles cover the whole history. */
export function priceChart(asset: Asset, interval: string, from: string | null): PriceChart {
  const m = master(asset);
  const window =
    WINDOWS.find((w) => w.interval === interval) ?? (WINDOWS[3] as (typeof WINDOWS)[0]);
  const steps =
    window.interval === "1d" && !from
      ? MASTER_LEN
      : Math.min(MASTER_LEN, STEPS_PER_DAY * window.days);
  const { stride } = window;
  const points: PriceChart["points"] = [];
  for (let i = MASTER_LEN - steps + stride - 1; i < MASTER_LEN; i += stride) {
    let volume = 0;
    for (let k = i - stride + 1; k <= i; k++) volume += m.volume[k] as number;
    const close = (m.price[i] as number).toFixed(8);
    points.push({
      t: new Date(m.end - (MASTER_LEN - 1 - i) * STEP_MS).toISOString(),
      simulated: true,
      open: close,
      high: close,
      low: close,
      close,
      volumeBase: "0",
      volumeQuote: volume.toFixed(2),
      trades: 0,
      filled: false,
    });
  }
  return {
    representationId: asset.id,
    interval: window.interval,
    from: points[0]?.t ?? new Date(m.end).toISOString(),
    to: new Date(m.end + STEP_MS).toISOString(),
    points,
    source: ["simulated_feed"],
    simulated: true,
    filledPoints: 0,
  };
}

/** One row of `GET /v1/assets`: the registry summary plus simulated market figures. */
export function directoryItem(
  summary: AssetSummary,
  asset: Asset,
  convertible: boolean,
): AssetDirectoryItem {
  const m = master(asset);
  const last = m.price[MASTER_LEN - 1] as number;
  const at = (back: number) => m.price[MASTER_LEN - 1 - back] as number;
  let volume = 0;
  for (let k = MASTER_LEN - STEPS_PER_DAY; k < MASTER_LEN; k++) volume += m.volume[k] as number;
  const sparkline: string[] = [];
  for (let d = 6; d >= 0; d--) sparkline.push(at(d * STEPS_PER_DAY).toFixed(8));
  const supply = circulating(asset);
  const vault =
    Number(BigInt(asset.vaultInventory) / 10n ** BigInt(Math.max(0, asset.decimals - 2))) / 100;
  const bps = (back: number) => Math.round((last / at(back) - 1) * 10_000);
  return {
    ...summary,
    category: asset.canonicalAsset.category,
    tags: [],
    chains: [asset.network],
    convertible,
    bridgeable: false,
    market: {
      price: last.toFixed(8),
      currency: "USD",
      priceAsOf: new Date(m.end).toISOString(),
      change24hBps: bps(STEPS_PER_DAY),
      change7dBps: bps(STEPS_PER_DAY * 7),
      change30dBps: bps(STEPS_PER_DAY * 30),
      supply: (BigInt(supply) * 10n ** BigInt(asset.decimals)).toString(),
      marketCap: (last * supply).toFixed(2),
      volume24h: volume.toFixed(2),
      tvl: (vault * last).toFixed(2),
      rank: null,
      sources: ["simulated_feed"],
      simulated: true,
    },
    sparkline: { interval: "1d", points: sparkline, simulated: true },
  };
}
