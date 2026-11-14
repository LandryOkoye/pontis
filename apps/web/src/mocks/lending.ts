// In-memory lending venue for mock mode and tests. It mirrors the API's lending module
// (apps/api/src/lending): registry-driven eligibility, integer-only capacity, and unsigned plans
// whose effects apply only when the simulated wallet sends them.
import type {
  BorrowingCapacity,
  CollateralAsset,
  Eligibility,
  EligibilityReason,
  EligibilityRequest,
  LendingMarket,
  LendingOperation,
  LendingPlan,
  LendingTx,
  PlanRequest,
  WalletCollateral,
} from "../lib/lending-types.ts";

export const DEMO_EVM_ACCOUNT = "0xa11ce0000000000000000000000000000000beef";

const WAD = 10n ** 18n;
// Obviously fake addresses that still read differently when shortened.
const MORPHO = "0xb10e000000000000000000000000000000b10e00";
const TOKEN = {
  nvda: "0x4e56000000000000000000000000000000da0001",
  tsla: "0x7515000000000000000000000000000000a00002",
  amzn: "0xa32e000000000000000000000000000000000003",
  usdc: "0x05dc000000000000000000000000000000dc0004",
  usdt: "0x05d7000000000000000000000000000000d70005",
};
const DECIMALS: Record<string, number> = {
  [TOKEN.nvda]: 18,
  [TOKEN.tsla]: 18,
  [TOKEN.amzn]: 18,
  [TOKEN.usdc]: 6,
  [TOKEN.usdt]: 6,
};

const ISSUER = { id: "pontis-test-issuer", name: "Pontis Test Issuer", authorized: true };
const ASSETS: CollateralAsset[] = [
  {
    id: "mock-nvda-sepolia",
    symbol: "NVDA",
    underlyingReference: "Synthetic NVIDIA share reference (mock, unbacked)",
    chain: "ethereum-sepolia",
    tokenStandard: "ERC-20",
    token: TOKEN.nvda,
    decimals: 18,
    origin: "pontis",
    verified: true,
    issuer: ISSUER,
  },
  {
    id: "mock-tsla-sepolia",
    symbol: "TSLA",
    underlyingReference: "Synthetic Tesla share reference (mock, unbacked)",
    chain: "ethereum-sepolia",
    tokenStandard: "ERC-20",
    token: TOKEN.tsla,
    decimals: 18,
    origin: "pontis",
    verified: true,
    issuer: ISSUER,
  },
  {
    id: "mock-amzn-sepolia",
    symbol: "AMZN",
    underlyingReference: "Synthetic Amazon share reference (mock, unbacked)",
    chain: "ethereum-sepolia",
    tokenStandard: "ERC-20",
    token: TOKEN.amzn,
    decimals: 18,
    origin: "pontis",
    verified: false,
    issuer: { id: "unlisted-issuer", name: "Unlisted Issuer", authorized: false },
  },
  {
    id: "rhea-tgold-near",
    symbol: "TGOLD",
    underlyingReference: "Synthetic gold reference discovered on Rhea (mock, unbacked)",
    chain: "near-testnet",
    tokenStandard: "NEP-141",
    token: "tgold.rhea-mock.testnet",
    decimals: 6,
    origin: "rhea",
    verified: true,
    issuer: ISSUER,
  },
];

interface Policy {
  maxLtvWad: bigint;
  maxOracleAgeSeconds: number;
}
const POLICIES: Record<string, Policy> = {
  "mock-nvda-sepolia": { maxLtvWad: WAD / 2n, maxOracleAgeSeconds: 3_600 },
  "mock-tsla-sepolia": { maxLtvWad: (WAD * 4n) / 10n, maxOracleAgeSeconds: 3_600 },
};

interface MarketConfig {
  id: string;
  collateralAssetId: string;
  collateralToken: string;
  loanToken: string;
  loanSymbol: string;
  lltvWad: bigint;
  liquidity: bigint;
  /** Loan-token smallest units per collateral smallest unit, as a rational. */
  price: { numerator: bigint; denominator: bigint; ageSeconds: number };
}
const usd = (whole: number) => BigInt(whole) * 1_000_000n;
const MARKETS: MarketConfig[] = [
  {
    id: "nvda-usdc-sepolia",
    collateralAssetId: "mock-nvda-sepolia",
    collateralToken: TOKEN.nvda,
    loanToken: TOKEN.usdc,
    loanSymbol: "USDC",
    lltvWad: (WAD * 625n) / 1000n,
    liquidity: usd(50_000),
    price: { numerator: usd(140), denominator: WAD, ageSeconds: 45 },
  },
  {
    id: "tsla-usdc-sepolia",
    collateralAssetId: "mock-tsla-sepolia",
    collateralToken: TOKEN.tsla,
    loanToken: TOKEN.usdc,
    loanSymbol: "USDC",
    lltvWad: WAD / 2n,
    liquidity: usd(600),
    price: { numerator: usd(250), denominator: WAD, ageSeconds: 90 },
  },
  {
    id: "nvda-usdt-sepolia",
    collateralAssetId: "mock-nvda-sepolia",
    collateralToken: TOKEN.nvda,
    loanToken: TOKEN.usdt,
    loanSymbol: "USDT",
    lltvWad: WAD / 2n,
    liquidity: usd(20_000),
    price: { numerator: usd(140), denominator: WAD, ageSeconds: 60 },
  },
  {
    // Its oracle reading is older than the policy allows, so Pontis refuses it.
    id: "tsla-usdt-sepolia",
    collateralAssetId: "mock-tsla-sepolia",
    collateralToken: TOKEN.tsla,
    loanToken: TOKEN.usdt,
    loanSymbol: "USDT",
    lltvWad: WAD / 2n,
    liquidity: usd(8_000),
    price: { numerator: usd(250), denominator: WAD, ageSeconds: 3 * 3_600 },
  },
];

export class LendingMockError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Position {
  collateral: bigint;
  debt: bigint;
}
interface State {
  balances: Map<string, bigint>;
  positions: Map<string, Position>;
  liquidity: Map<string, bigint>;
  /** Effects of planned calls, keyed by calldata, applied when the wallet sends them. */
  pending: Map<string, () => void>;
  nonce: number;
}

function seed(): State {
  const tokens = (whole: number) => BigInt(whole) * WAD;
  return {
    balances: new Map([
      [`${DEMO_EVM_ACCOUNT}:${TOKEN.nvda}`, tokens(12)],
      [`${DEMO_EVM_ACCOUNT}:${TOKEN.tsla}`, tokens(8)],
      [`${DEMO_EVM_ACCOUNT}:${TOKEN.usdc}`, usd(250)],
    ]),
    positions: new Map(),
    liquidity: new Map(MARKETS.map((m) => [m.id, m.liquidity])),
    pending: new Map(),
    nonce: 0,
  };
}

let state = seed();

const key = (owner: string, id: string) => `${owner.toLowerCase()}:${id}`;
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const balance = (owner: string, token: string) => state.balances.get(key(owner, token)) ?? 0n;
const position = (owner: string, marketId: string): Position =>
  state.positions.get(key(owner, marketId)) ?? { collateral: 0n, debt: 0n };

function move(owner: string, token: string, delta: bigint): void {
  const next = balance(owner, token) + delta;
  if (next < 0n) throw new Error("ERC20: transfer amount exceeds balance");
  state.balances.set(key(owner, token), next);
}

function market(id: string): MarketConfig {
  const found = MARKETS.find((m) => m.id === id);
  if (!found) throw new LendingMockError("NOT_FOUND", 404, "Lending market not found");
  return found;
}

function requireOwner(owner: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner))
    throw new LendingMockError("VALIDATION_ERROR", 400, "owner must be an EVM address");
  return owner;
}

const toWire = (m: MarketConfig): LendingMarket => ({
  id: m.id,
  provider: "morpho-blue",
  chain: "ethereum-sepolia",
  collateralAssetId: m.collateralAssetId,
  collateralToken: m.collateralToken,
  loanToken: m.loanToken,
  loanSymbol: m.loanSymbol,
  lltvWad: m.lltvWad.toString(),
  availableLiquidity: (state.liquidity.get(m.id) ?? 0n).toString(),
  enabled: true,
});

function eligibility(input: EligibilityRequest): Eligibility {
  const asset = ASSETS.find((a) => a.id === input.assetId) ?? null;
  const policy = POLICIES[input.assetId];
  const priced = MARKETS.find(
    (m) =>
      m.collateralAssetId === input.assetId &&
      m.loanToken.toLowerCase() === input.loanToken.toLowerCase(),
  );
  const reasons: EligibilityReason[] = [];
  if (!asset || !policy) reasons.push("UNKNOWN_ASSET");
  if (asset && !asset.verified) reasons.push("UNVERIFIED_TOKEN");
  if (asset && !asset.issuer.authorized) reasons.push("UNAUTHORIZED_ISSUER");
  if (asset && asset.chain !== input.chain) reasons.push("UNSUPPORTED_CHAIN");
  if (policy && input.provider !== "morpho-blue") reasons.push("UNSUPPORTED_PROVIDER");
  if (!priced) reasons.push("MISSING_PRICE");
  else if (policy && priced.price.ageSeconds > policy.maxOracleAgeSeconds)
    reasons.push("STALE_PRICE");
  return {
    eligible: reasons.length === 0,
    reasons,
    asset,
    priceObservedAt: priced
      ? new Date(Date.now() - priced.price.ageSeconds * 1_000).toISOString()
      : null,
  };
}

const marketEligibility = (m: MarketConfig) =>
  eligibility({
    assetId: m.collateralAssetId,
    provider: "morpho-blue",
    chain: "ethereum-sepolia",
    loanToken: m.loanToken,
  });

function requireEligible(m: MarketConfig): void {
  const result = marketEligibility(m);
  if (!result.eligible) throw new LendingMockError("NOT_ELIGIBLE", 422, result.reasons.join(", "));
}

const valueOf = (m: MarketConfig, collateral: bigint) =>
  (collateral * m.price.numerator) / m.price.denominator;

function capacity(marketId: string, owner: string): BorrowingCapacity {
  const m = market(marketId);
  requireEligible(m);
  const { collateral, debt } = position(requireOwner(owner), m.id);
  const liquidity = state.liquidity.get(m.id) ?? 0n;
  const collateralValue = valueOf(m, collateral);
  const allowed = min(m.lltvWad, POLICIES[m.collateralAssetId]?.maxLtvWad ?? 0n);
  const maximum = (collateralValue * allowed) / WAD;
  const headroom = maximum > debt ? maximum - debt : 0n;
  const ltv = collateralValue === 0n ? (debt === 0n ? 0n : WAD) : (debt * WAD) / collateralValue;
  return {
    collateralValue: collateralValue.toString(),
    maximumBorrowCapacity: maximum.toString(),
    availableBorrowAmount: min(headroom, liquidity).toString(),
    outstandingDebt: debt.toString(),
    currentLtvWad: ltv.toString(),
    liquidationThresholdWad: m.lltvWad.toString(),
    healthFactorWad: debt === 0n ? null : ((collateralValue * m.lltvWad) / debt).toString(),
    marketLiquidity: liquidity.toString(),
  };
}

/** Registers a planned call. Its effect runs only if the wallet sends this exact calldata. */
function call(to: string, description: string, effect: () => void): LendingTx {
  state.nonce += 1;
  const data = `0x${state.nonce.toString(16).padStart(8, "0")}${"00".repeat(32)}`;
  state.pending.set(data, effect);
  return { chain: "ethereum-sepolia", to, data, value: "0", description };
}

const reverted = (reason: string) =>
  new LendingMockError("INTERNAL", 500, `Simulation reverted: ${reason}`);

function plan(operation: LendingOperation, body: PlanRequest): LendingPlan {
  const owner = requireOwner(body.owner);
  if (!/^(0|[1-9][0-9]*)$/.test(body.amount))
    throw new LendingMockError("VALIDATION_ERROR", 400, "amount must be an integer string");
  const amount = BigInt(body.amount);
  if (amount <= 0n) throw new LendingMockError("VALIDATION_ERROR", 400, "Amount must be positive");
  const m = market(body.marketId);
  const id = key(owner, m.id);
  const current = () => position(owner, m.id);
  const liquidity = () => state.liquidity.get(m.id) ?? 0n;
  const noop = () => {};
  let transactions: LendingTx[];

  if (operation === "deposit") {
    requireEligible(m);
    transactions = [
      call(m.collateralToken, "Approve collateral for Morpho Blue", noop),
      call(MORPHO, "Supply collateral to Morpho Blue", () => {
        move(owner, m.collateralToken, -amount);
        const p = current();
        state.positions.set(id, { ...p, collateral: p.collateral + amount });
      }),
    ];
  } else if (operation === "borrow") {
    requireEligible(m);
    if (amount > BigInt(capacity(m.id, owner).availableBorrowAmount))
      throw new LendingMockError(
        "INSUFFICIENT_INVENTORY",
        422,
        "Borrow amount exceeds capacity or market liquidity",
      );
    transactions = [
      call(MORPHO, "Borrow loan assets from Morpho Blue", () => {
        if (amount > liquidity()) throw new Error("insufficient liquidity");
        const p = current();
        state.positions.set(id, { ...p, debt: p.debt + amount });
        state.liquidity.set(m.id, liquidity() - amount);
        move(owner, m.loanToken, amount);
      }),
    ];
  } else if (operation === "repay") {
    if (amount > current().debt) throw reverted("repayment exceeds the outstanding debt");
    transactions = [
      call(m.loanToken, "Approve loan token for repayment", noop),
      call(MORPHO, "Repay Morpho Blue debt", () => {
        const p = current();
        if (amount > p.debt) throw new Error("repayment exceeds debt");
        move(owner, m.loanToken, -amount);
        state.positions.set(id, { ...p, debt: p.debt - amount });
        state.liquidity.set(m.id, liquidity() + amount);
      }),
    ];
  } else {
    const p = current();
    if (amount > p.collateral) throw reverted("withdrawal exceeds the supplied collateral");
    if (p.debt > (valueOf(m, p.collateral - amount) * m.lltvWad) / WAD)
      throw reverted("the position would be undercollateralised");
    transactions = [
      call(MORPHO, "Withdraw Morpho Blue collateral", () => {
        const now = current();
        if (amount > now.collateral) throw new Error("insufficient collateral");
        state.positions.set(id, { ...now, collateral: now.collateral - amount });
        move(owner, m.collateralToken, amount);
      }),
    ];
  }
  return { provider: "morpho-blue", marketId: m.id, transactions };
}

function walletAssets(owner: string): WalletCollateral[] {
  requireOwner(owner);
  return MARKETS.filter((m) => marketEligibility(m).eligible).flatMap((m) => {
    const held = balance(owner, m.collateralToken);
    const asset = ASSETS.find((a) => a.id === m.collateralAssetId);
    return held > 0n && asset ? [{ asset, provider: "morpho-blue", balance: held.toString() }] : [];
  });
}

export const lendingDb = {
  reset: () => {
    state = seed();
  },
  assets: () => ASSETS,
  markets: () => MARKETS.map(toWire),
  eligibility,
  capacity,
  plan,
  walletAssets,
  // The simulated chain, as the simulated wallet sees it.
  decimals(token: string): number {
    const decimals = DECIMALS[token.toLowerCase()];
    if (decimals === undefined) throw new Error("Unknown mock token");
    return decimals;
  },
  balanceOf: (token: string, owner: string) => balance(owner, token),
  /** Applies a planned call. Throws when the call would revert. */
  execute(data: string): void {
    const effect = state.pending.get(data);
    if (!effect) throw new Error("The simulated chain does not know this call.");
    effect();
    state.pending.delete(data);
  },
};
