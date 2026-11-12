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

export const health: Health = { status: "ok", chainHeight: 200_000_000, indexerLagBlocks: 2 };

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
      settlement: "ATOMIC",
      description:
        "Controlled test vault, same chain, atomic. Parity conversion of a synthetic test asset.",
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

export const simulatedIntentQuote = {
  quoteId: "sim-intent-1",
  amountIn: "1000",
  amountOut: "990",
  minAmountOut: "990",
  deadline: "2026-11-12T18:00:00.000Z",
  source: "simulated_intents",
  simulated: true,
  confidentiality: "public",
} as const;

export const simulatedPrivateRfqSubmission = {
  status: "matched",
  confidentiality_level: "operator_trusted",
  simulated: true,
  settlement: {
    settlementId: "rfq-1",
    assetId: "sim:asset-a",
    size: "50",
    price: "100",
    buyOrderId: "buy-1",
    sellOrderId: "sell-1",
    commitment: "a".repeat(64),
    settlementMode: "not_submitted",
    confidentiality_level: "operator_trusted",
    simulated: true,
  },
} as const;
