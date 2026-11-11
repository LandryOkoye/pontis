// Deterministic example payloads for the MVP synthetic assets (docs/asset-dossiers). The frontend
// builds MSW mocks from these. Quote math uses the shared domain helpers so the numbers stay
// consistent with the contract rules (ADR 0001). Every export is validated by the schemas in tests.
import {
  amountToString,
  applyFloor,
  mulDivCeil,
  rational,
  rationalToWire,
  ratioBetween,
} from "@pontis/domain";
import type {
  Asset,
  AssetSummary,
  Compatibility,
  Health,
  Issuer,
  IssuerSummary,
} from "./registry-types.ts";
import type { NavChart, PriceChart, SupplyChart, VolumeChart } from "./chart-types.ts";
import type { AssetDirectoryItem, MarketSnapshot } from "./market-types.ts";
import type { CompareResponse, SearchResult } from "./discovery-types.ts";
import type { AssetIssuerView, AssetMetadata } from "./detail-types.ts";
import type { RouteGuardsResponse } from "./guard-types.ts";
import type { IssuerLeaderboard, Status } from "./status-types.ts";
import type {
  CategoryList,
  ChainList,
  MarketMovers,
  MarketOverview,
  Mover,
} from "./overview-types.ts";
import type { Quote, Transaction } from "./trading-types.ts";

const T0 = "2026-11-07T18:00:00.000Z";
const OWNER = "pontis-owner.testnet";
const SHA = "a".repeat(64);

const MULT_A = rational(1n, 1_000_000n);
const MULT_B = rational(1n, 1_000_000_000n);
const RATIO_A_TO_B = ratioBetween(MULT_A, MULT_B); // 1000/1
export const FIXTURE_FEE_BPS = 10;

const flags = { synthetic: true, verificationStatus: "unverified" } as const;

const evidenceFor = (
  subjectType: "issuer" | "canonical_asset" | "representation",
  subjectId: string,
) => ({
  id: `ev-${subjectId}`,
  subjectType,
  subjectId,
  uri: `docs/asset-dossiers/${subjectId}.md`,
  sha256: SHA,
  provenance: "issuer_provided" as const,
  description:
    "Synthetic test dossier, self-attested by the project. Nothing was checked by a third party.",
  addedBy: OWNER,
  addedAt: T0,
});

export const issuerSummaryA: IssuerSummary = {
  id: "synthetic-issuer-a",
  name: "Synthetic Issuer A",
  status: "active",
  ...flags,
};
export const issuerSummaryB: IssuerSummary = {
  id: "synthetic-issuer-b",
  name: "Synthetic Issuer B",
  status: "active",
  ...flags,
};

const issuer = (s: IssuerSummary, account: string): Issuer => ({
  ...s,
  jurisdiction: null,
  authorizedCategories: ["synthetic test claims"],
  controlledAccounts: [account],
  contact: "Pontis project team (testnet only)",
  lastReviewedAt: T0,
  evidence: [evidenceFor("issuer", s.id)],
});

export const issuerA: Issuer = issuer(issuerSummaryA, "tgold-a.pontis.testnet");
export const issuerB: Issuer = issuer(issuerSummaryB, "tgold-b.pontis.testnet");

export const canonicalAsset: Asset["canonicalAsset"] = {
  id: "syn-gold-oz",
  name: "Synthetic Gold, one troy ounce",
  category: "Synthetic commodity claim (test only)",
  claimDescription: "A fictional claim to one troy ounce of fictional allocated gold.",
  unitDefinition: "1 canonical unit = 1 fictional troy ounce",
  denomination: null,
  economicRights: "None. The claim confers no economic rights.",
  legalClaimStructure: "None. There is no legal entity, contract or trust behind it.",
  jurisdiction: null,
  redemptionTerms: "None. The claim cannot be redeemed.",
  valuationMethod: null,
  eligibilityRestrictions: "Testnet allowlist only; not a regulatory eligibility regime.",
  riskDisclosures: ["Not backed by any asset.", "Parity conversion says nothing about price."],
  status: "active",
  lastReviewedAt: T0,
  ...flags,
};

const asset = (
  id: "tgold-a" | "tgold-b",
  symbol: string,
  name: string,
  accountId: string,
  decimals: number,
  multiplier: ReturnType<typeof rational>,
  s: IssuerSummary,
  inventory: bigint,
): Asset => ({
  id,
  canonicalAsset,
  issuer: s,
  network: "near-testnet",
  accountId,
  standard: "NEP-141",
  name,
  symbol,
  decimals,
  unitMultiplier: rationalToWire(multiplier),
  adminCapabilities: ["owner mint", "owner burn", "owner pause", "testnet faucet_mint"],
  custodyDescription: "None",
  redemptionMechanism: "None",
  transferPolicySummary: "Testnet allowlist in pontis-core",
  bridgeStatus: "none",
  allowlistRequired: true,
  status: "active",
  lastReviewedAt: T0,
  evidence: [evidenceFor("representation", id)],
  vaultInventory: amountToString(inventory),
  ...flags,
});

export const tgoldA: Asset = asset(
  "tgold-a",
  "TGOLD-A",
  "SYNTHETIC TEST Gold A",
  "tgold-a.pontis.testnet",
  6,
  MULT_A,
  issuerSummaryA,
  1_000_000_000_000n,
);
export const tgoldB: Asset = asset(
  "tgold-b",
  "TGOLD-B",
  "SYNTHETIC TEST Gold B",
  "tgold-b.pontis.testnet",
  8,
  MULT_B,
  issuerSummaryB,
  1_000_000_000_000_000n,
);

const summary = (a: Asset): AssetSummary => ({
  id: a.id,
  symbol: a.symbol,
  name: a.name,
  network: a.network,
  accountId: a.accountId,
  decimals: a.decimals,
  unitMultiplier: a.unitMultiplier,
  status: a.status,
  canonicalAssetId: a.canonicalAsset.id,
  canonicalAssetName: a.canonicalAsset.name,
  issuer: a.issuer,
  synthetic: a.synthetic,
  verificationStatus: a.verificationStatus,
});
export const tgoldASummary = summary(tgoldA);
export const tgoldBSummary = summary(tgoldB);

const relationship = (
  counterpartId: string,
  ratio: ReturnType<typeof rational>,
): Compatibility => ({
  id: "rel-tgold-a-tgold-b",
  counterpartId,
  classification: "DIRECT_EQUIVALENT",
  ratio: rationalToWire(ratio),
  scope: "Parity conversion of synthetic test tokens through the controlled test vault only.",
  rationale:
    "Both tokens are test representations of SYN-GOLD-OZ; ratio derived from unit multipliers (1 A = 10 B).",
  version: 1,
  status: "approved",
  parityEnabled: true,
  proposedBy: OWNER,
  approvedBy: OWNER,
  updatedAt: T0,
  evidence: [],
  history: [
    {
      version: 1,
      action: "approved",
      classification: "DIRECT_EQUIVALENT",
      status: "approved",
      ratio: rationalToWire(ratio),
      scope: "Parity conversion of synthetic test tokens through the controlled test vault only.",
      rationale: "Approved for the MVP demonstration; self-reviewed.",
      actor: OWNER,
      at: T0,
    },
  ],
});
/** Relationship as seen from TGOLD-A (counterpart B) and from TGOLD-B (inverted ratio). */
export const compatibilityFromA: Compatibility = relationship("tgold-b", RATIO_A_TO_B);
export const compatibilityFromB: Compatibility = relationship("tgold-a", rational(1n, 1000n));

export const health: Health = {
  status: "ok",
  chainHeight: 200_000_000,
  indexerLagBlocks: 2,
  database: true,
  rpc: true,
  indexer: {
    state: "running",
    lagBlocks: 2,
    lastHeartbeatAt: "2026-11-07T18:00:00.000Z",
    heartbeatAgeMs: 1_500,
  },
};

/** Quote converting 1 TGOLD-A (1_000_000 smallest units) to TGOLD-B. */
export function buildQuote(amountIn: bigint, state: Quote["state"] = "QUOTED"): Quote {
  const gross = applyFloor(RATIO_A_TO_B, amountIn);
  const fee = mulDivCeil(gross, BigInt(FIXTURE_FEE_BPS), 10_000n);
  return {
    id: "3f1f6b0e-8a4d-4c9b-9d52-0c1f6a7a1e10",
    fromId: "tgold-a",
    toId: "tgold-b",
    accountId: "alice.testnet",
    amountIn: amountToString(amountIn),
    amountOutGross: amountToString(gross),
    fee: amountToString(fee),
    amountOut: amountToString(gross - fee),
    ratio: rationalToWire(RATIO_A_TO_B),
    feeBps: FIXTURE_FEE_BPS,
    expiresAt: "2026-11-07T18:01:00.000Z",
    route: {
      type: "PARITY_CONVERSION",
      venue: "CONTROLLED_TEST_VAULT",
      network: "near-testnet",
      settlement: "ASYNC_CALLBACK_WITH_REFUND",
      description:
        "Controlled test vault, same chain. Settled asynchronously across several receipts with a refund if the payout fails; not an atomic transaction.",
    },
    compatibilityVersion: 1,
    policyVersion: 1,
    warnings: [{ code: "SYNTHETIC", message: "Synthetic, unbacked test assets. Testnet only." }],
    state,
    createdAt: T0,
  };
}

export const quote: Quote = buildQuote(1_000_000n);

export const transactionSettled: Transaction = {
  id: "c6a9f0a4-2b8e-4a53-8f06-2b9a0a6f3e11",
  quote: buildQuote(1_000_000n, "SETTLED"),
  state: "SETTLED",
  txHash: "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T",
  reportedTxHash: "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T",
  txHashStatus: "VERIFIED",
  failureReason: null,
  events: [
    {
      eventName: "conversion_completed",
      receiptId: "5m3xKcM6W7kQ1sF2dRnA4T9ZkBqE3nVhJ2pJt8h4Y8y",
      logIndex: 0,
      blockHeight: 200_000_010,
      blockTimestamp: "2026-11-07T18:00:30.000Z",
      txHash: "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T",
      data: { amount_in: quote.amountIn, amount_out: quote.amountOut },
    },
  ],
  createdAt: T0,
  submittedAt: "2026-11-07T18:00:20.000Z",
  settledAt: "2026-11-07T18:00:30.000Z",
};

// ---- market data (ADR 0015): every figure is simulated and says so ----

const FROM = "2026-11-11T09:00:00.000Z";
const TO = "2026-11-11T12:00:00.000Z";
const hours = ["2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", "2026-11-11T11:00:00.000Z"];

const marketA: MarketSnapshot = {
  price: "2681.42585338",
  currency: "USD",
  priceAsOf: "2026-11-11T12:00:00.000Z",
  change24hBps: 31,
  change7dBps: 396,
  change30dBps: -5,
  supply: "12400000000",
  marketCap: "33250000.5",
  volume24h: "1250000.25",
  tvl: "4100000",
  rank: 1,
  sources: ["simulated_feed"],
  simulated: true,
};

const marketB: MarketSnapshot = {
  ...marketA,
  price: "268.01474754",
  supply: "1240000000000",
  marketCap: "3324000.1",
  volume24h: "104000",
  tvl: "410000",
  rank: 2,
};

const sparkline = (points: string[]) => ({ interval: "4h" as const, points, simulated: true });

const directoryFacts = {
  category: "Synthetic commodity claim (test only)",
  tags: ["synthetic", "gold", "commodity"],
  chains: ["near-testnet"],
  convertible: true,
  bridgeable: false,
};

export const directoryItemA: AssetDirectoryItem = {
  ...tgoldASummary,
  ...directoryFacts,
  market: marketA,
  sparkline: sparkline(["2660.1", "2671.9", "2668.4", "2681.42585338"]),
};

export const directoryItemB: AssetDirectoryItem = {
  ...tgoldBSummary,
  ...directoryFacts,
  market: marketB,
  sparkline: sparkline(["266.0", "267.2", "266.8", "268.01474754"]),
};

export const assetDirectory = {
  items: [directoryItemA, directoryItemB],
  nextCursor: null,
  total: 2,
};

const envelope = {
  representationId: "tgold-a",
  interval: "1h" as const,
  from: FROM,
  to: TO,
  source: ["simulated_feed" as const],
  simulated: true,
};

export const priceChart: PriceChart = {
  ...envelope,
  filledPoints: 1,
  points: [
    {
      t: hours[0] as string,
      simulated: true,
      open: "2660.1",
      high: "2672",
      low: "2655.5",
      close: "2671.9",
      volumeBase: "5000000",
      volumeQuote: "13359.5",
      trades: 2,
      filled: false,
    },
    {
      t: hours[1] as string,
      simulated: true,
      open: "2671.9",
      high: "2679",
      low: "2664",
      close: "2668.4",
      volumeBase: "0",
      volumeQuote: "0",
      trades: 0,
      filled: false,
    },
    {
      t: hours[2] as string,
      simulated: true,
      open: "2668.4",
      high: "2668.4",
      low: "2668.4",
      close: "2668.4",
      volumeBase: "0",
      volumeQuote: "0",
      trades: 0,
      filled: true,
    },
  ],
};

export const navChart: NavChart = {
  ...envelope,
  representationId: "tustb-h",
  filledPoints: 0,
  points: hours.map((t, i) => ({ t, simulated: true, nav: `1.0164${i}`, filled: false })),
};

export const supplyChart: SupplyChart = {
  ...envelope,
  filledPoints: 2,
  points: hours.map((t, i) => ({ t, simulated: true, supply: "12400000000", filled: i > 0 })),
};

export const volumeChart: VolumeChart = {
  ...envelope,
  filledPoints: 0,
  points: priceChart.points.map((p) => ({
    t: p.t,
    simulated: true,
    volumeBase: p.volumeBase,
    volumeQuote: p.volumeQuote,
    trades: p.trades,
    filled: false,
  })),
};

const mover = (id: string, symbol: string, market: MarketSnapshot): Mover => ({
  id,
  symbol,
  name: `SYNTHETIC TEST Gold ${symbol.slice(-1)}`,
  price: market.price,
  change24hBps: market.change24hBps,
  marketCap: market.marketCap,
  volume24h: market.volume24h,
  tvl: market.tvl,
  simulated: market.simulated,
});

const moverA = mover("tgold-a", "TGOLD-A", marketA);
const moverB = mover("tgold-b", "TGOLD-B", marketB);

export const marketOverview: MarketOverview = {
  data: "all",
  asOf: "2026-11-11T12:00:00.000Z",
  assetCount: 2,
  pricedAssetCount: 2,
  issuerCount: 2,
  chainCount: 1,
  convertibleAssetCount: 2,
  totalMarketCap: "36574000.6",
  totalTvl: "4510000",
  volume24h: "1354000.25",
  change24hBps: 31,
  simulated: true,
  sources: ["simulated_feed"],
};

export const marketMovers: MarketMovers = {
  data: "all",
  gainers: [moverB, moverA],
  losers: [],
  topByVolume: [moverA, moverB],
  topByTvl: [moverA, moverB],
  newlyListed: [
    { id: "tgold-b", symbol: "TGOLD-B", name: moverB.name, registeredAt: T0, market: moverB },
    { id: "tgold-a", symbol: "TGOLD-A", name: moverA.name, registeredAt: T0, market: moverA },
  ],
};

export const categoryList: CategoryList = {
  data: "all",
  items: [
    {
      category: "Synthetic commodity claim (test only)",
      assetCount: 2,
      marketCap: "36574000.6",
      volume24h: "1354000.25",
      tvl: "4510000",
      simulated: true,
      sources: ["simulated_feed"],
    },
  ],
};

export const chainList: ChainList = {
  data: "all",
  items: [
    {
      chain: "near-testnet",
      assetCount: 2,
      value: "36574000.6",
      supplies: [
        { id: "tgold-a", supply: "12400000000" },
        { id: "tgold-b", supply: "1240000000000" },
      ],
      simulated: true,
      sources: ["simulated_feed"],
    },
  ],
};

export const assetMetadata: AssetMetadata = {
  id: "tgold-a",
  canonicalAssetId: "syn-gold-oz",
  category: "Synthetic commodity claim (test only)",
  profile: {
    description:
      "A synthetic test token for one fictional troy ounce of gold. Not backed by anything.",
    tags: ["synthetic", "gold", "commodity"],
    sections: {
      overview: "SYNTHETIC TEST ASSET. Issued by the project for the testnet demo.",
      risk: "Not backed by any asset. Parity conversion says nothing about price.",
    },
    convertible: true,
    bridgeable: false,
    source: "simulated_feed",
    simulated: true,
    updatedAt: T0,
  },
};

export const assetIssuerView: AssetIssuerView = {
  issuer: issuerA,
  assets: [{ id: "tgold-a", symbol: "TGOLD-A", name: "SYNTHETIC TEST Gold A", status: "active" }],
};

export const assetChainList = {
  items: [
    {
      chain: "near-testnet",
      contract: "tgold-a.pontis.testnet",
      role: "native",
      supply: "12400000000",
      supplyAsOf: "2026-11-11T00:00:00.000Z",
      simulated: true,
    },
  ],
};

export const assetDocumentList = {
  items: [
    {
      title: "TGOLD-A dossier",
      uri: "docs/asset-dossiers/TGOLD-A.md",
      sha256: SHA,
      origin: "registry_evidence" as const,
      provenance: "issuer_provided" as const,
    },
  ],
};

export const activityList = {
  items: [
    {
      kind: "conversion" as const,
      at: "2026-11-11T10:20:00.000Z",
      accountId: "sim-user-3.testnet",
      fromId: "tgold-a",
      toId: "tgold-b",
      amountIn: "5000000",
      amountOut: "4995000000",
      fee: "5000000",
      source: "simulated_feed" as const,
      simulated: true,
    },
  ],
  nextCursor: null,
};

export const compareResponse: CompareResponse = {
  data: "all",
  items: [directoryItemA, directoryItemB].map((i) => ({
    id: i.id,
    symbol: i.symbol,
    name: i.name,
    canonicalAssetId: i.canonicalAssetId,
    issuer: i.issuer,
    status: i.status,
    verificationStatus: i.verificationStatus,
    chains: i.chains,
    convertible: i.convertible,
    bridgeable: i.bridgeable,
    market: i.market,
    navPerToken: null,
    premiumToNavBps: null,
  })),
  pairs: [
    {
      fromId: "tgold-a",
      toId: "tgold-b",
      parityRatio: "10",
      impliedRatio: "10.00497222",
      deviationBps: 4,
      simulated: true,
    },
    {
      fromId: "tgold-b",
      toId: "tgold-a",
      parityRatio: "0.1",
      impliedRatio: "0.09995031",
      deviationBps: -4,
      simulated: true,
    },
  ],
};

export const searchResult: SearchResult = {
  q: "gold",
  assets: [tgoldASummary, tgoldBSummary].map((a) => ({
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    canonicalAssetName: a.canonicalAssetName,
    issuer: a.issuer,
  })),
  issuers: [],
  chains: [],
};

export const issuerLeaderboard: IssuerLeaderboard = {
  data: "all",
  items: [
    {
      rank: 1,
      issuer: issuerSummaryA,
      assetCount: 1,
      totalMarketCap: "33250000.5",
      simulated: true,
      reliabilityScore: null,
    },
    {
      rank: 2,
      issuer: issuerSummaryB,
      assetCount: 1,
      totalMarketCap: "3324000.1",
      simulated: true,
      reliabilityScore: null,
    },
  ],
};

export const status: Status = {
  asOf: "2026-11-11T12:00:00.000Z",
  health,
  prices: {
    real: { latestAt: null, ageSeconds: null, stale: true },
    simulated: { latestAt: "2026-11-11T11:55:00.000Z", ageSeconds: 300, stale: false },
  },
  marketJobs: { latestAt: "2026-11-11T11:59:30.000Z", ageSeconds: 30, stale: false },
  routes: { approved: 1, suspended: 0, proposed: 0 },
  reserves: null,
  bridge: null,
  incidents: [],
};

/** The guard breakdown for 1 TGOLD-A: both reference prices are the simulator's, and say so. */
export const routeGuards: RouteGuardsResponse = {
  fromId: "tgold-a",
  toId: "tgold-b",
  amount: "1000000",
  executable: true,
  guarded: true,
  degraded: false,
  feeBps: 14,
  skewBps: 4,
  checks: [
    { name: "route", passed: true, detail: "executable" },
    { name: "guard", passed: true, detail: "configured" },
    { name: "price_freshness", passed: true, detail: "tgold-a: 4000 ms old, limit 60000 ms" },
    { name: "price_freshness", passed: true, detail: "tgold-b: 4000 ms old, limit 60000 ms" },
    { name: "circuit_breaker", passed: true, detail: "no violations" },
    { name: "amount_limits", passed: true, detail: "within limits" },
    { name: "vault_inventory", passed: true, detail: "needs 999000000, holds 5000000000" },
  ],
  prices: [
    {
      representationId: "tgold-a",
      price: "100",
      currency: "USD",
      asOf: "2026-11-07T17:59:56.000Z",
      ageMs: 4_000,
      source: "simulated_feed",
      simulated: true,
    },
    {
      representationId: "tgold-b",
      price: "10",
      currency: "USD",
      asOf: "2026-11-07T17:59:56.000Z",
      ageMs: 4_000,
      source: "simulated_feed",
      simulated: true,
    },
  ],
};
