import { blueAbi } from "@morpho-org/morpho-sdk/abis";
import {
  erc20Abi,
  encodeAbiParameters,
  encodeFunctionData,
  isAddress,
  keccak256,
  type Address,
} from "viem";
import type { PublicClient } from "viem";
import type {
  LendingMarket,
  LendingPosition,
  LendingProvider,
  WalletAsset,
  WalletTransaction,
} from "./types.ts";

const SEPOLIA_CHAIN_ID = 11_155_111;
const WAD = 10n ** 18n;

export interface MorphoBlueMarketConfig {
  readonly id: string;
  readonly collateralAssetId: string;
  readonly collateralToken: Address;
  readonly loanToken: Address;
  readonly loanSymbol: "USDC" | "USDT" | string;
  readonly oracle: Address;
  readonly irm: Address;
  readonly lltvWad: bigint;
}

type MarketParams = {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: bigint;
};

/**
 * Direct, config-gated Morpho Blue adapter for controlled Sepolia deployments.
 * It uses Morpho's official ABI package, verifies every configured contract has
 * code, and returns unsigned calls only. The official high-level SDK currently
 * relies on its address registry for bundle deployments, so direct core calls
 * keep a controlled testnet deployment explicit rather than silently targeting
 * an unverified periphery address.
 */
export class MorphoBlueSepoliaProvider implements LendingProvider {
  readonly id = "morpho-blue" as const;
  private readonly markets = new Map<string, MorphoBlueMarketConfig>();

  constructor(
    private readonly client: PublicClient,
    private readonly morpho: Address,
    markets: readonly MorphoBlueMarketConfig[],
  ) {
    if (!isAddress(morpho)) throw new Error("Invalid Morpho Blue contract address");
    for (const market of markets) {
      if (
        !isAddress(market.collateralToken) ||
        !isAddress(market.loanToken) ||
        !isAddress(market.oracle) ||
        !isAddress(market.irm)
      )
        throw new Error(`Invalid contract address in market ${market.id}`);
      if (market.lltvWad <= 0n || market.lltvWad > WAD)
        throw new Error(`Invalid LLTV in market ${market.id}`);
      this.markets.set(market.id, market);
    }
  }

  async discoverWalletAssets(owner: string): Promise<readonly WalletAsset[]> {
    const address = requireAddress(owner);
    return Promise.all(
      [...this.markets.values()].map(async (market) => ({
        assetId: market.collateralAssetId,
        token: market.collateralToken,
        balance: await this.client.readContract({
          address: market.collateralToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
      })),
    );
  }

  async listMarkets(): Promise<readonly LendingMarket[]> {
    await this.assertConfiguredContracts();
    return Promise.all([...this.markets.values()].map((market) => this.toMarket(market)));
  }

  async getPosition(marketId: string, owner: string): Promise<LendingPosition> {
    const market = this.market(marketId);
    const address = requireAddress(owner);
    await this.assertConfiguredContracts(market);
    const params = paramsFor(market);
    const id = marketHash(params);
    const [marketState, position] = await Promise.all([
      this.client.readContract({
        address: this.morpho,
        abi: blueAbi,
        functionName: "market",
        args: [id],
      }),
      this.client.readContract({
        address: this.morpho,
        abi: blueAbi,
        functionName: "position",
        args: [id, address],
      }),
    ]);
    const [totalBorrowAssets, totalBorrowShares] = marketState;
    const [, borrowShares, collateral] = position;
    // Morpho debt is share-based. Ceiling division is conservative for UI/risk quoting.
    const debt =
      totalBorrowShares === 0n ? 0n : ceilDiv(borrowShares * totalBorrowAssets, totalBorrowShares);
    return { provider: this.id, marketId, owner: address, collateral, debt };
  }

  async buildDeposit(
    marketId: string,
    owner: string,
    collateral: bigint,
  ): Promise<readonly WalletTransaction[]> {
    const market = this.market(marketId);
    const address = requireAddress(owner);
    requirePositive(collateral, "collateral");
    await this.assertConfiguredContracts(market);
    return [
      this.call(
        market.collateralToken,
        erc20Abi,
        "approve",
        [this.morpho, collateral],
        "Approve collateral for Morpho Blue",
      ),
      this.call(
        this.morpho,
        blueAbi,
        "supplyCollateral",
        [paramsFor(market), collateral, address, "0x"],
        "Supply collateral to Morpho Blue",
      ),
    ];
  }

  async buildBorrow(
    marketId: string,
    owner: string,
    assets: bigint,
  ): Promise<readonly WalletTransaction[]> {
    const market = this.market(marketId);
    const address = requireAddress(owner);
    requirePositive(assets, "borrow assets");
    await this.assertConfiguredContracts(market);
    const position = await this.getPosition(marketId, address);
    const liquidity = await this.availableLiquidity(market);
    if (assets > liquidity) throw new Error("Insufficient Morpho market liquidity");
    // eth_call catches a stale oracle, LLTV breach or a paused/invalid market before a plan is returned.
    await this.client.simulateContract({
      address: this.morpho,
      abi: blueAbi,
      functionName: "borrow",
      args: [paramsFor(market), assets, 0n, address, address],
      account: address,
    });
    if (position.collateral === 0n)
      throw new Error("Collateral must be confirmed on-chain before borrowing");
    return [
      this.call(
        this.morpho,
        blueAbi,
        "borrow",
        [paramsFor(market), assets, 0n, address, address],
        "Borrow loan assets from Morpho Blue",
      ),
    ];
  }

  async buildRepay(
    marketId: string,
    owner: string,
    assets: bigint,
  ): Promise<readonly WalletTransaction[]> {
    const market = this.market(marketId);
    const address = requireAddress(owner);
    requirePositive(assets, "repay assets");
    await this.assertConfiguredContracts(market);
    await this.client.simulateContract({
      address: this.morpho,
      abi: blueAbi,
      functionName: "repay",
      args: [paramsFor(market), assets, 0n, address, "0x"],
      account: address,
    });
    return [
      this.call(
        market.loanToken,
        erc20Abi,
        "approve",
        [this.morpho, assets],
        "Approve loan token for repayment",
      ),
      this.call(
        this.morpho,
        blueAbi,
        "repay",
        [paramsFor(market), assets, 0n, address, "0x"],
        "Repay Morpho Blue debt",
      ),
    ];
  }

  async buildWithdraw(
    marketId: string,
    owner: string,
    collateral: bigint,
  ): Promise<readonly WalletTransaction[]> {
    const market = this.market(marketId);
    const address = requireAddress(owner);
    requirePositive(collateral, "collateral");
    await this.assertConfiguredContracts(market);
    await this.client.simulateContract({
      address: this.morpho,
      abi: blueAbi,
      functionName: "withdrawCollateral",
      args: [paramsFor(market), collateral, address, address],
      account: address,
    });
    return [
      this.call(
        this.morpho,
        blueAbi,
        "withdrawCollateral",
        [paramsFor(market), collateral, address, address],
        "Withdraw Morpho Blue collateral",
      ),
    ];
  }

  private async toMarket(config: MorphoBlueMarketConfig): Promise<LendingMarket> {
    return {
      id: config.id,
      provider: this.id,
      chain: "ethereum-sepolia",
      collateralAssetId: config.collateralAssetId,
      collateralToken: config.collateralToken,
      loanToken: config.loanToken,
      loanSymbol: config.loanSymbol,
      lltvWad: config.lltvWad,
      availableLiquidity: await this.availableLiquidity(config),
      enabled: true,
    };
  }

  private async availableLiquidity(config: MorphoBlueMarketConfig): Promise<bigint> {
    const [totalSupplyAssets, , totalBorrowAssets] = await this.client.readContract({
      address: this.morpho,
      abi: blueAbi,
      functionName: "market",
      args: [marketHash(paramsFor(config))],
    });
    return totalSupplyAssets > totalBorrowAssets ? totalSupplyAssets - totalBorrowAssets : 0n;
  }

  private call(
    to: Address,
    abi: typeof blueAbi | typeof erc20Abi,
    functionName: string,
    args: readonly unknown[],
    description: string,
  ): WalletTransaction {
    return {
      chain: "ethereum-sepolia",
      to,
      data: encodeData({ abi, functionName, args }),
      value: 0n,
      description,
    };
  }

  private market(id: string): MorphoBlueMarketConfig {
    const market = this.markets.get(id);
    if (!market) throw new Error(`Unknown Morpho Blue market ${id}`);
    return market;
  }

  private async assertConfiguredContracts(market?: MorphoBlueMarketConfig): Promise<void> {
    if ((await this.client.getChainId()) !== SEPOLIA_CHAIN_ID)
      throw new Error("Morpho RPC is not connected to Ethereum Sepolia");
    const contracts = market
      ? [this.morpho, market.collateralToken, market.loanToken, market.oracle, market.irm]
      : [this.morpho];
    const code = await Promise.all(contracts.map((address) => this.client.getCode({ address })));
    if (code.some((bytecode) => !bytecode || bytecode === "0x"))
      throw new Error("Configured Morpho market contract has no deployed code");
  }
}

function paramsFor(market: MorphoBlueMarketConfig): MarketParams {
  return {
    loanToken: market.loanToken,
    collateralToken: market.collateralToken,
    oracle: market.oracle,
    irm: market.irm,
    lltv: market.lltvWad,
  };
}

function marketHash(params: MarketParams): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [params.loanToken, params.collateralToken, params.oracle, params.irm, params.lltv],
    ),
  );
}

const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
const requirePositive = (value: bigint, name: string) => {
  if (value <= 0n) throw new Error(`${name} must be positive`);
};
const requireAddress = (value: string): Address => {
  if (!isAddress(value)) throw new Error("Invalid wallet address");
  return value;
};
// The ABI is a union (Morpho or ERC-20) at this internal helper; narrowing each
// caller would add type-only overloads without changing the generated calldata.
const encodeData = encodeFunctionData as unknown as (input: {
  abi: typeof blueAbi | typeof erc20Abi;
  functionName: string;
  args: readonly unknown[];
}) => `0x${string}`;
