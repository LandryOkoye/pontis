import { calculateBorrowingCapacity } from "./risk.ts";
import type { CollateralRegistry } from "./eligibility.ts";
import type { LendingProviders } from "./providers.ts";
import type {
  BorrowingCapacity,
  CollateralEligibility,
  LendingMarket,
  LendingOperation,
  OraclePrice,
  WalletTransaction,
} from "./types.ts";

export interface OraclePriceSource {
  get(assetId: string, loanToken: string): Promise<OraclePrice | null>;
}

export interface EligibleWalletAsset {
  readonly provider: "morpho-blue" | "rhea";
  readonly assetId: string;
  readonly balance: bigint;
}

/** Pontis' orchestration module: policy first, provider call second. */
export class LendingService {
  constructor(
    private readonly registry: CollateralRegistry,
    private readonly providers: LendingProviders,
    private readonly prices: OraclePriceSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listCollateralAssets() {
    return this.registry.listAssets();
  }

  async listEligibleWalletAssets(owner: string): Promise<readonly EligibleWalletAsset[]> {
    const [assets, markets] = await Promise.all([
      this.providers.discoverWalletAssets(owner),
      this.providers.listMarkets(),
    ]);
    const out: EligibleWalletAsset[] = [];
    for (const holding of assets) {
      if (holding.balance === 0n) continue;
      for (const market of markets.filter(
        (candidate) => candidate.collateralAssetId === holding.assetId && candidate.enabled,
      )) {
        const eligibility = await this.eligibility(market);
        if (eligibility.eligible)
          out.push({
            provider: market.provider,
            assetId: holding.assetId,
            balance: holding.balance,
          });
      }
    }
    return out;
  }

  async listMarkets(): Promise<readonly LendingMarket[]> {
    return (await this.providers.listMarkets()).filter((market) => market.enabled);
  }

  async eligibilityFor(
    assetId: string,
    provider: "morpho-blue" | "rhea",
    chain: LendingMarket["chain"],
    loanToken: string,
  ): Promise<CollateralEligibility> {
    return this.registry.assess({
      assetId,
      provider,
      chain,
      loanToken,
      price: await this.prices.get(assetId, loanToken),
      now: this.now(),
    });
  }

  async borrowingCapacity(marketId: string, owner: string): Promise<BorrowingCapacity> {
    const market = await this.market(marketId);
    const eligibility = await this.eligibility(market);
    if (!eligibility.eligible)
      throw new LendingRefusal("NOT_ELIGIBLE", eligibility.reasons.join(", "));
    const position = await this.providers.get(market.provider).getPosition(market.id, owner);
    return calculateBorrowingCapacity(eligibility, market, position);
  }

  async plan(
    operation: LendingOperation,
    marketId: string,
    owner: string,
    amount: bigint,
  ): Promise<{
    provider: "morpho-blue" | "rhea";
    marketId: string;
    transactions: readonly WalletTransaction[];
  }> {
    if (amount <= 0n) throw new LendingRefusal("VALIDATION_ERROR", "Amount must be positive");
    const market = await this.market(marketId);
    const provider = this.providers.get(market.provider);
    if (operation === "deposit" || operation === "borrow") {
      const eligibility = await this.eligibility(market);
      if (!eligibility.eligible)
        throw new LendingRefusal("NOT_ELIGIBLE", eligibility.reasons.join(", "));
    }
    if (operation === "borrow") {
      const capacity = await this.borrowingCapacity(marketId, owner);
      if (amount > capacity.availableBorrowAmount)
        throw new LendingRefusal(
          "INSUFFICIENT_INVENTORY",
          "Borrow amount exceeds capacity or market liquidity",
        );
    }
    const transactions = await {
      deposit: () => provider.buildDeposit(marketId, owner, amount),
      borrow: () => provider.buildBorrow(marketId, owner, amount),
      repay: () => provider.buildRepay(marketId, owner, amount),
      withdraw: () => provider.buildWithdraw(marketId, owner, amount),
    }[operation]();
    return { provider: market.provider, marketId, transactions };
  }

  private async eligibility(market: LendingMarket): Promise<CollateralEligibility> {
    return this.eligibilityFor(
      market.collateralAssetId,
      market.provider,
      market.chain,
      market.loanToken,
    );
  }

  private async market(id: string): Promise<LendingMarket> {
    const market = (await this.providers.listMarkets()).find(
      (candidate) => candidate.id === id && candidate.enabled,
    );
    if (!market) throw new LendingRefusal("NOT_FOUND", "Lending market not found");
    return market;
  }
}

export class LendingRefusal extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "NOT_ELIGIBLE" | "INSUFFICIENT_INVENTORY" | "VALIDATION_ERROR",
    message: string,
  ) {
    super(message);
  }
}
