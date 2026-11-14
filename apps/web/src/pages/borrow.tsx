// Borrow: the lending markets, what Pontis accepts as collateral, and the connected wallet's
// eligible holdings. Pontis decides eligibility and capacity; the venue holds the position.
import { ArrowRight, HandCoins, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import {
  ChainAddress,
  EligibilityChips,
  EvmWalletControl,
  RegistryChips,
} from "../components/lending.tsx";
import {
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { useEvmWallet } from "../evm/wallet.tsx";
import {
  CHAIN_LABEL,
  lendingUnavailable,
  PROVIDER_LABEL,
  useCapacity,
  useCollateralAssets,
  useEligibilities,
  useLendingMarkets,
  useTokenDecimalsMany,
  useWalletCollateral,
  wadPercent,
} from "../lib/lending.ts";
import type { CollateralAsset, Eligibility, LendingMarket } from "../lib/lending-types.ts";

const TH = "eyebrow border-b border-line [&>th]:px-5 [&>th]:py-3 [&>th]:font-normal";
const TR = "group transition hover:bg-panel-2 [&>td]:px-5 [&>td]:py-4";

function Rows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

/** Loan-token figure; the dash covers decimals that could not be read from the token. */
function Loan({
  value,
  decimals,
  symbol,
}: {
  value: string | undefined;
  decimals: number | undefined;
  symbol: string;
}) {
  if (value === undefined || decimals === undefined) return <span className="text-faint">—</span>;
  return <Amount value={value} decimals={decimals} symbol={symbol} compact />;
}

function MarketRow({
  market,
  asset,
  eligibility,
  eligibilityFailed,
  loanDecimals,
  owner,
}: {
  market: LendingMarket;
  asset: CollateralAsset | undefined;
  eligibility: Eligibility | undefined;
  eligibilityFailed: boolean;
  loanDecimals: number | undefined;
  owner: string | null;
}) {
  const actionable = market.chain === "ethereum-sepolia";
  const capacity = useCapacity(market.id, owner, actionable && eligibility?.eligible === true);
  const symbol = asset?.symbol ?? market.collateralAssetId;
  const to = `/app/borrow/${encodeURIComponent(market.id)}`;
  return (
    <tr className={TR}>
      <td>
        <Link to={to} className="block">
          <span className="font-medium group-hover:text-text">
            {symbol} / {market.loanSymbol}
          </span>
          <span className="block text-xs text-faint">
            {asset?.underlyingReference ?? "Collateral is not in the registry"}
          </span>
        </Link>
      </td>
      <td>
        <span className="block">{PROVIDER_LABEL[market.provider]}</span>
        <span className="text-xs text-faint">{CHAIN_LABEL[market.chain]}</span>
      </td>
      <td className="num text-right">{wadPercent(market.lltvWad)}</td>
      <td className="text-right">
        <Loan
          value={market.availableLiquidity}
          decimals={loanDecimals}
          symbol={market.loanSymbol}
        />
      </td>
      <td>
        <EligibilityChips eligibility={eligibility} failed={eligibilityFailed} />
      </td>
      {owner && (
        <>
          <td className="text-right">
            <Loan
              value={capacity.data?.outstandingDebt}
              decimals={loanDecimals}
              symbol={market.loanSymbol}
            />
          </td>
          <td className="text-right">
            <Loan
              value={capacity.data?.availableBorrowAmount}
              decimals={loanDecimals}
              symbol={market.loanSymbol}
            />
          </td>
        </>
      )}
      <td className="text-right">
        <Link
          to={to}
          aria-label={`Open ${symbol} / ${market.loanSymbol}`}
          className="inline-grid size-8 place-items-center rounded-md text-faint transition group-hover:bg-panel-3 group-hover:text-text"
        >
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

function Markets({ owner }: { owner: string | null }) {
  const markets = useLendingMarkets();
  const assets = useCollateralAssets();
  const list = markets.data ?? [];
  const eligibilities = useEligibilities(list);
  // Loan-token decimals are read from Sepolia; other chains show a dash for now.
  const loanTokens = [
    ...new Set(list.filter((m) => m.chain === "ethereum-sepolia").map((m) => m.loanToken)),
  ];
  const decimals = useTokenDecimalsMany(loanTokens);
  const decimalsOf = (market: LendingMarket) =>
    decimals[loanTokens.indexOf(market.loanToken)]?.data;

  return (
    <Panel className="overflow-hidden" aria-label="Lending markets">
      <PanelHeader
        title="Lending markets"
        eyebrow="One isolated market per collateral and loan token. Liquidity is supplied by lenders, not by Pontis."
        className="pb-4"
      />
      {markets.isError ? (
        lendingUnavailable(markets.error) ? (
          <EmptyState
            icon={<HandCoins className="size-4" aria-hidden />}
            title="Lending is not enabled on this API"
            body="The API serves lending only once a verified Morpho Blue deployment on Sepolia has been configured."
          />
        ) : (
          <ErrorState error={markets.error} onRetry={() => void markets.refetch()} />
        )
      ) : markets.isLoading ? (
        <Rows />
      ) : list.length === 0 ? (
        <EmptyState
          title="No lending markets"
          body="No market is enabled. Markets appear here once they are deployed, verified and funded."
        />
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className={TH}>
                <th scope="col">Market</th>
                <th scope="col">Venue</th>
                <th scope="col" className="text-right">
                  Liquidation LTV
                </th>
                <th scope="col" className="text-right">
                  Available liquidity
                </th>
                <th scope="col">Collateral status</th>
                {owner && (
                  <>
                    <th scope="col" className="text-right">
                      Your debt
                    </th>
                    <th scope="col" className="text-right">
                      You can borrow
                    </th>
                  </>
                )}
                <th scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((market, i) => (
                <MarketRow
                  key={market.id}
                  market={market}
                  asset={assets.data?.find((a) => a.id === market.collateralAssetId)}
                  eligibility={eligibilities[i]?.data}
                  eligibilityFailed={eligibilities[i]?.isError ?? false}
                  loanDecimals={decimalsOf(market)}
                  owner={owner}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function WalletHoldings({ owner }: { owner: string | null }) {
  const wallet = useEvmWallet();
  const holdings = useWalletCollateral(owner);
  if (!owner)
    return (
      <Panel>
        <EmptyState
          icon={<Wallet className="size-4" aria-hidden />}
          title="No Sepolia wallet connected"
          body={
            wallet.ready && !wallet.available
              ? "Lending positions live on Ethereum Sepolia. Install an EVM wallet such as MetaMask to see your collateral and borrow."
              : "Lending positions live on Ethereum Sepolia, so they use an EVM wallet rather than your NEAR account. Connect one to see your eligible collateral and your positions."
          }
          action={<EvmWalletControl />}
        />
      </Panel>
    );
  return (
    <Panel className="overflow-hidden" aria-label="Eligible collateral in your wallet">
      <PanelHeader
        title="Eligible collateral in your wallet"
        eyebrow="Tokens you hold that pass every registry, policy and price check right now."
        className="pb-4"
      />
      {holdings.isError ? (
        <ErrorState error={holdings.error} onRetry={() => void holdings.refetch()} />
      ) : holdings.isLoading ? (
        <Rows count={2} />
      ) : !holdings.data?.length ? (
        <EmptyState
          title="No eligible collateral in this wallet"
          body="This wallet holds none of the tokens that are currently accepted as collateral."
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {holdings.data.map((holding, i) => (
            <li
              key={`${holding.asset.id}-${holding.provider}-${i}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <p className="font-medium">{holding.asset.symbol}</p>
                <p className="text-xs text-faint">
                  {PROVIDER_LABEL[holding.provider]} · {CHAIN_LABEL[holding.asset.chain]}
                </p>
              </div>
              <Amount
                value={holding.balance}
                decimals={holding.asset.decimals}
                symbol={holding.asset.symbol}
                className="text-base"
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Registry() {
  const assets = useCollateralAssets();
  if (assets.isError && lendingUnavailable(assets.error)) return null;
  return (
    <Panel className="overflow-hidden" aria-label="Collateral registry">
      <PanelHeader
        title="Collateral registry"
        eyebrow="Every token Pontis knows as collateral. Being listed is not the same as being eligible."
        className="pb-4"
      />
      {assets.isError ? (
        <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
      ) : assets.isLoading ? (
        <Rows />
      ) : !assets.data?.length ? (
        <EmptyState title="No collateral registered" />
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className={TH}>
                <th scope="col">Token</th>
                <th scope="col">Issuer</th>
                <th scope="col">Chain</th>
                <th scope="col">Contract</th>
                <th scope="col">Source</th>
                <th scope="col">Registry checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {assets.data.map((asset) => (
                <tr key={asset.id} className={TR}>
                  <td>
                    <span className="font-medium">{asset.symbol}</span>
                    <span className="block text-xs text-faint">{asset.underlyingReference}</span>
                  </td>
                  <td>{asset.issuer.name}</td>
                  <td>
                    <span className="block">{CHAIN_LABEL[asset.chain]}</span>
                    <span className="text-xs text-faint">
                      {asset.tokenStandard} · {asset.decimals} decimals
                    </span>
                  </td>
                  <td>
                    <ChainAddress value={asset.token} />
                  </td>
                  <td>
                    <Chip tone={asset.origin === "rhea" ? "ion" : "neutral"}>
                      {asset.origin === "rhea" ? "Discovered on Rhea" : "Pontis registry"}
                    </Chip>
                  </td>
                  <td>
                    <RegistryChips asset={asset} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function Borrow() {
  const wallet = useEvmWallet();
  return (
    <>
      <PageHeader
        eyebrow="Collateral"
        title="Borrow against tokenised assets"
        lede="Pontis checks that a token is acceptable collateral and works out a conservative borrowing capacity. The position itself is held on the lending venue, and your wallet signs every call."
        actions={wallet.account ? <EvmWalletControl /> : undefined}
      />
      <div className="space-y-5">
        <WalletHoldings owner={wallet.account} />
        <Markets owner={wallet.account} />
        <Registry />
      </div>
      <p className="mt-6 text-[13px] text-faint">
        Testnet only. Collateral tokens and stablecoins here are mock ERC-20s with no value, and a
        liquidation LTV is a market parameter, not a promise about any real asset.
      </p>
    </>
  );
}
