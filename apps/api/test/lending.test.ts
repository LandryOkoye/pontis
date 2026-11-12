import { describe, expect, it } from "vitest";
import {
  CollateralRegistry,
  LendingProviders,
  LendingRefusal,
  LendingService,
  WAD,
  calculateBorrowingCapacity,
  type LendingMarket,
  type LendingPosition,
  type LendingProvider,
  type OraclePrice,
  type WalletTransaction,
} from "../src/lending/index.ts";

const NOW = new Date("2026-11-12T12:00:00.000Z");
const asset = {
  id: "mock-nvda",
  symbol: "NVDA",
  underlyingReference: "NVIDIA common stock",
  chain: "ethereum-sepolia" as const,
  tokenStandard: "ERC-20" as const,
  token: "0x1111111111111111111111111111111111111111",
  decimals: 18,
  origin: "pontis" as const,
  verified: true,
  issuer: { id: "demo-issuer", name: "Demo Issuer", authorized: true },
};
const policy = {
  assetId: asset.id,
  enabled: true,
  maxLtvWad: WAD / 2n,
  maxOracleAgeSeconds: 60,
  minimumValuationConfidenceBps: 9_500,
  allowedProviders: ["morpho-blue"] as const,
  allowedChains: ["ethereum-sepolia"] as const,
  restrictions: [],
};
const market: LendingMarket = {
  id: "nvda-usdc",
  provider: "morpho-blue",
  chain: "ethereum-sepolia",
  collateralAssetId: asset.id,
  collateralToken: asset.token,
  loanToken: "0x2222222222222222222222222222222222222222",
  loanSymbol: "USDC",
  lltvWad: 600_000_000_000_000_000n,
  availableLiquidity: 400n,
  enabled: true,
};
const price: OraclePrice = {
  assetId: asset.id,
  loanToken: market.loanToken,
  numerator: 100n,
  denominator: 1n,
  observedAt: NOW,
  confidenceBps: 9_900,
  verified: true,
};
const position: LendingPosition = {
  provider: "morpho-blue",
  marketId: market.id,
  owner: "0xabc",
  collateral: 10n,
  debt: 100n,
};

class FakeMorpho implements LendingProvider {
  readonly id = "morpho-blue" as const;
  deposits = 0;
  borrows = 0;
  async discoverWalletAssets() {
    return [{ assetId: asset.id, token: asset.token, balance: 10n }];
  }
  async listMarkets() {
    return [market];
  }
  async getPosition() {
    return position;
  }
  async buildDeposit(_marketId: string, _owner: string, amount: bigint) {
    this.deposits++;
    return [transaction(`deposit ${amount}`)];
  }
  async buildBorrow(_marketId: string, _owner: string, amount: bigint) {
    this.borrows++;
    return [transaction(`borrow ${amount}`)];
  }
  async buildRepay(_marketId: string, _owner: string, amount: bigint) {
    return [transaction(`repay ${amount}`)];
  }
  async buildWithdraw(_marketId: string, _owner: string, amount: bigint) {
    return [transaction(`withdraw ${amount}`)];
  }
}

const transaction = (description: string): WalletTransaction => ({
  chain: "ethereum-sepolia",
  to: asset.token,
  data: "0x",
  value: 0n,
  description,
});
const service = (provider = new FakeMorpho(), quote = price) => ({
  provider,
  lending: new LendingService(
    new CollateralRegistry([asset], [policy]),
    new LendingProviders([provider]),
    { get: async () => quote },
    () => NOW,
  ),
});

describe("collateral eligibility and capacity", () => {
  it("applies Pontis' lower policy LTV, existing debt, and lender-provided liquidity", async () => {
    const { lending } = service();
    const capacity = await lending.borrowingCapacity(market.id, "0xabc");
    expect(capacity).toMatchObject({
      collateralValue: 1_000n,
      maximumBorrowCapacity: 500n,
      outstandingDebt: 100n,
      availableBorrowAmount: 400n,
    });
    expect(capacity.currentLtvWad).toBe(100_000_000_000_000_000n);
    expect(capacity.healthFactorWad).toBe(6_000_000_000_000_000_000n);
  });

  it("rejects stale prices before it asks a provider to build a deposit or borrow", async () => {
    const stale = { ...price, observedAt: new Date(NOW.getTime() - 61_000) };
    const { lending, provider } = service(new FakeMorpho(), stale);
    await expect(lending.plan("deposit", market.id, "0xabc", 1n)).rejects.toMatchObject({
      code: "NOT_ELIGIBLE",
    });
    await expect(lending.plan("borrow", market.id, "0xabc", 1n)).rejects.toMatchObject({
      code: "NOT_ELIGIBLE",
    });
    expect([provider.deposits, provider.borrows]).toEqual([0, 0]);
  });

  it("enforces provider liquidity and returns unsigned calls only after checks pass", async () => {
    const { lending, provider } = service();
    await expect(lending.plan("borrow", market.id, "0xabc", 401n)).rejects.toBeInstanceOf(
      LendingRefusal,
    );
    const plan = await lending.plan("borrow", market.id, "0xabc", 400n);
    expect(plan.transactions[0]?.description).toBe("borrow 400");
    expect(provider.borrows).toBe(1);
  });

  it("never turns an unsupported Rhea-origin NEAR asset into Morpho collateral", async () => {
    const rheaAsset = {
      ...asset,
      id: "rhea-nvda",
      chain: "near-testnet" as const,
      tokenStandard: "NEP-141" as const,
      origin: "rhea" as const,
    };
    const registry = new CollateralRegistry(
      [rheaAsset],
      [
        {
          ...policy,
          assetId: rheaAsset.id,
          allowedProviders: ["rhea"],
          allowedChains: ["near-testnet"],
        },
      ],
    );
    const result = registry.assess({
      assetId: rheaAsset.id,
      provider: "morpho-blue",
      chain: "ethereum-sepolia",
      loanToken: market.loanToken,
      price,
      now: NOW,
    });
    expect(result).toMatchObject({ eligible: false });
    expect(result.reasons).toContain("UNSUPPORTED_PROVIDER");
    expect(result.reasons).toContain("UNSUPPORTED_CHAIN");
  });

  it("fails closed if the eligibility result is not current and verified", () => {
    const registry = new CollateralRegistry([asset], [policy]);
    const eligibility = registry.assess({
      assetId: asset.id,
      provider: "morpho-blue",
      chain: "ethereum-sepolia",
      loanToken: market.loanToken,
      price: { ...price, verified: false },
      now: NOW,
    });
    expect(() => calculateBorrowingCapacity(eligibility, market, position)).toThrow("not eligible");
  });
});
