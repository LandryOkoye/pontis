import type {
  LendingMarket,
  LendingPosition,
  LendingProvider,
  LendingProviderId,
  WalletAsset,
  WalletTransaction,
} from "./types.ts";

/** Small provider seam: adding Rhea never changes Pontis' eligibility or risk modules. */
export class LendingProviders {
  private readonly providers: ReadonlyMap<LendingProviderId, LendingProvider>;

  constructor(providers: readonly LendingProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  get(id: LendingProviderId): LendingProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Lending provider ${id} is not configured`);
    return provider;
  }

  async listMarkets(): Promise<readonly LendingMarket[]> {
    return (
      await Promise.all([...this.providers.values()].map((provider) => provider.listMarkets()))
    ).flat();
  }

  async discoverWalletAssets(owner: string): Promise<readonly WalletAsset[]> {
    return (
      await Promise.all(
        [...this.providers.values()].map((provider) => provider.discoverWalletAssets(owner)),
      )
    ).flat();
  }
}

/**
 * Rhea is intentionally a separate NEAR adapter. It may discover Rhea assets and
 * build Rhea-native actions, but it never represents a NEAR asset as an ERC-20
 * or routes it through Morpho without a separately registered representation.
 */
export class RheaLendingProvider implements LendingProvider {
  readonly id = "rhea" as const;

  constructor(
    private readonly adapter: {
      discoverWalletAssets(owner: string): Promise<readonly WalletAsset[]>;
      listMarkets(): Promise<readonly LendingMarket[]>;
      getPosition(marketId: string, owner: string): Promise<LendingPosition>;
      buildDeposit(
        marketId: string,
        owner: string,
        collateral: bigint,
      ): Promise<readonly WalletTransaction[]>;
      buildBorrow(
        marketId: string,
        owner: string,
        assets: bigint,
      ): Promise<readonly WalletTransaction[]>;
      buildRepay(
        marketId: string,
        owner: string,
        assets: bigint,
      ): Promise<readonly WalletTransaction[]>;
      buildWithdraw(
        marketId: string,
        owner: string,
        collateral: bigint,
      ): Promise<readonly WalletTransaction[]>;
    },
  ) {}

  discoverWalletAssets(owner: string) {
    return this.adapter.discoverWalletAssets(owner);
  }
  listMarkets() {
    return this.adapter.listMarkets();
  }
  getPosition(marketId: string, owner: string) {
    return this.adapter.getPosition(marketId, owner);
  }
  buildDeposit(marketId: string, owner: string, collateral: bigint) {
    return this.adapter.buildDeposit(marketId, owner, collateral);
  }
  buildBorrow(marketId: string, owner: string, assets: bigint) {
    return this.adapter.buildBorrow(marketId, owner, assets);
  }
  buildRepay(marketId: string, owner: string, assets: bigint) {
    return this.adapter.buildRepay(marketId, owner, assets);
  }
  buildWithdraw(marketId: string, owner: string, collateral: bigint) {
    return this.adapter.buildWithdraw(marketId, owner, collateral);
  }
}
