// One lending market: the connected wallet's position and capacity, Pontis' eligibility verdict,
// the market's parameters, and the deposit / borrow / repay / withdraw panel.
import { ArrowLeft, Wallet } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { LendingAction } from "../components/lending-action.tsx";
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
  Facts,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
  TONE_DOT,
} from "../components/ui/primitives.tsx";
import { EvmWalletPrompts, useEvmWallet } from "../evm/wallet.tsx";
import { cn } from "../lib/cn.ts";
import { formatDateTime, timeAgo } from "../lib/format.ts";
import {
  CHAIN_LABEL,
  healthText,
  healthTone,
  lendingUnavailable,
  PROVIDER_LABEL,
  REASON,
  useCapacity,
  useCollateralAssets,
  useEligibility,
  useLendingMarkets,
  useTokenDecimals,
  WAD,
  wadPercent,
} from "../lib/lending.ts";
import type { BorrowingCapacity, Eligibility, LendingMarket } from "../lib/lending-types.ts";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="text-[22px] leading-tight">{children}</dd>
    </div>
  );
}

/** Current loan-to-value on a scale that ends at the market's liquidation threshold. */
function LtvBar({ capacity }: { capacity: BorrowingCapacity }) {
  const lltv = BigInt(capacity.liquidationThresholdWad);
  const ltv = BigInt(capacity.currentLtvWad);
  const value = BigInt(capacity.collateralValue);
  // Pontis' own limit is the lower of its policy LTV and the market's, so it sits at or below
  // the liquidation threshold. It is only derivable once there is collateral.
  const limit = value > 0n ? (BigInt(capacity.maximumBorrowCapacity) * WAD) / value : null;
  const share = (wad: bigint) =>
    lltv === 0n ? 0 : Number(wad >= lltv ? 1000n : (wad * 1000n) / lltv) / 10;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-muted">Loan-to-value</span>
        <span className="num text-text">{wadPercent(ltv)}</span>
      </div>
      <div
        role="meter"
        aria-label="Loan-to-value against the liquidation threshold"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={share(ltv)}
        aria-valuetext={`${wadPercent(ltv)} of a ${wadPercent(lltv)} liquidation threshold`}
        className="relative mt-2 h-2 rounded-full bg-panel-3"
      >
        <div
          className={cn(
            "h-full rounded-full",
            TONE_DOT[healthTone(capacity.healthFactorWad ?? null)],
            capacity.healthFactorWad === null && "bg-faint",
          )}
          style={{ width: `${share(ltv)}%` }}
        />
        {limit !== null && limit < lltv && (
          <span
            className="absolute -top-1 h-4 w-px bg-text"
            style={{ left: `${share(limit)}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-faint">
        <span>
          {limit !== null ? (
            <>
              Pontis borrow limit <span className="num text-muted">{wadPercent(limit)}</span>
            </>
          ) : (
            "No collateral supplied"
          )}
        </span>
        <span>
          Liquidation at <span className="num text-muted">{wadPercent(lltv)}</span>
        </span>
      </div>
    </div>
  );
}

function Position({
  market,
  capacity,
  loanDecimals,
}: {
  market: LendingMarket;
  capacity: BorrowingCapacity;
  loanDecimals: number;
}) {
  const loan = (value: string) => (
    <Amount value={value} decimals={loanDecimals} symbol={market.loanSymbol} compact />
  );
  const tone = healthTone(capacity.healthFactorWad);
  return (
    <div className="space-y-6 px-5 pb-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <Stat label="Collateral value">{loan(capacity.collateralValue)}</Stat>
        <Stat label="Outstanding debt">{loan(capacity.outstandingDebt)}</Stat>
        <Stat label="Available to borrow">{loan(capacity.availableBorrowAmount)}</Stat>
        <Stat label="Maximum borrow capacity">{loan(capacity.maximumBorrowCapacity)}</Stat>
      </dl>
      <LtvBar capacity={capacity} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[13px]">
        <span className="text-muted">
          Health factor
          <span className="block text-xs text-faint">
            Liquidation LTV divided by current LTV. Below 1 the position can be liquidated.
          </span>
        </span>
        <Chip tone={tone} dot={capacity.healthFactorWad !== null}>
          {capacity.healthFactorWad === null ? "No debt" : healthText(capacity.healthFactorWad)}
        </Chip>
      </div>
    </div>
  );
}

function PositionPanel({
  market,
  eligibility,
  loanDecimals,
  capacity,
}: {
  market: LendingMarket;
  eligibility: Eligibility | undefined;
  loanDecimals: number | undefined;
  capacity: ReturnType<typeof useCapacity>;
}) {
  const wallet = useEvmWallet();
  return (
    <Panel aria-label="Your position">
      <PanelHeader
        title="Your position"
        eyebrow={`Valued in ${market.loanSymbol} at the verified oracle price.`}
        className="pb-5"
      />
      {!wallet.account ? (
        <EmptyState
          icon={<Wallet className="size-4" aria-hidden />}
          title="No Sepolia wallet connected"
          body="Connect an EVM wallet to see your collateral, your debt and how much you can borrow."
          action={<EvmWalletControl />}
        />
      ) : market.chain !== "ethereum-sepolia" ? (
        <div className="px-5 pb-6">
          <Notice title="Positions on this venue are not shown yet">
            This market is on {CHAIN_LABEL[market.chain]}. The app reads positions on Ethereum
            Sepolia only.
          </Notice>
        </div>
      ) : eligibility && !eligibility.eligible ? (
        <div className="px-5 pb-6">
          <Notice title="Capacity is not quoted for ineligible collateral">
            Pontis does not value a position while the collateral fails a check, so collateral and
            debt cannot be shown here. Repayments and withdrawals still work.
          </Notice>
        </div>
      ) : capacity.isError ? (
        <ErrorState error={capacity.error} onRetry={() => void capacity.refetch()} />
      ) : !capacity.data || loanDecimals === undefined ? (
        <div className="space-y-3 px-5 pb-6">
          <Skeleton className="h-28" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <Position market={market} capacity={capacity.data} loanDecimals={loanDecimals} />
      )}
    </Panel>
  );
}

function EligibilityPanel({
  eligibility,
  failed,
}: {
  eligibility: Eligibility | undefined;
  failed: boolean;
}) {
  return (
    <Panel aria-label="Collateral eligibility">
      <PanelHeader
        title="Collateral eligibility"
        eyebrow="Checked by Pontis before any deposit or borrow is planned."
        action={<EligibilityChips eligibility={eligibility} failed={failed} />}
        className="pb-4"
      />
      <div className="px-5 pb-5 text-[13px]">
        {failed ? (
          <p className="text-muted">The eligibility check could not be loaded.</p>
        ) : !eligibility ? (
          <Skeleton className="h-10" />
        ) : (
          <>
            {eligibility.eligible ? (
              <p className="text-muted">
                The token is verified, its issuer is authorised, the policy allows this chain and
                venue, and the oracle price is verified, fresh and confident enough.
              </p>
            ) : (
              <ul className="space-y-2">
                {eligibility.reasons.map((reason) => (
                  <li key={reason}>
                    <span className="font-medium text-warn">{REASON[reason].label}.</span>{" "}
                    <span className="text-muted">{REASON[reason].meaning}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-faint">
              {eligibility.priceObservedAt ? (
                <>
                  Oracle price observed {timeAgo(eligibility.priceObservedAt)} (
                  {formatDateTime(eligibility.priceObservedAt)}).
                </>
              ) : (
                "No oracle price has been observed for this pair."
              )}
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

export function BorrowMarket() {
  const { id } = useParams();
  const wallet = useEvmWallet();
  const markets = useLendingMarkets();
  const assets = useCollateralAssets();
  const market = markets.data?.find((m) => m.id === id);
  const asset = assets.data?.find((a) => a.id === market?.collateralAssetId);
  const eligibility = useEligibility(market);
  const onSepolia = market?.chain === "ethereum-sepolia";
  const loanDecimals = useTokenDecimals(onSepolia ? market?.loanToken : undefined);
  const capacity = useCapacity(
    market?.id,
    wallet.account,
    onSepolia && eligibility.data?.eligible === true,
  );

  const back = (
    <Link
      to="/app/borrow"
      className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> All markets
    </Link>
  );

  if (markets.isLoading)
    return (
      <div aria-busy="true" aria-label="Loading">
        <Skeleton className="mb-6 h-8 w-72 max-w-full" />
        <Skeleton className="h-72" />
      </div>
    );
  if (markets.isError || !market)
    return (
      <>
        {back}
        <Panel>
          {markets.isError && !lendingUnavailable(markets.error) ? (
            <ErrorState error={markets.error} onRetry={() => void markets.refetch()} />
          ) : (
            <EmptyState
              title={markets.isError ? "Lending is not enabled on this API" : "Market not found"}
              body={
                markets.isError
                  ? "The API serves lending only once a verified deployment has been configured."
                  : "No enabled lending market has this identifier."
              }
            />
          )}
        </Panel>
      </>
    );

  const symbol = asset?.symbol ?? market.collateralAssetId;
  const liquidity =
    loanDecimals.data === undefined ? (
      loanDecimals.isError ? (
        <span className="text-muted">Unavailable: the loan token could not be read.</span>
      ) : (
        <Skeleton className="h-4 w-24" />
      )
    ) : (
      <Amount
        value={market.availableLiquidity}
        decimals={loanDecimals.data}
        symbol={market.loanSymbol}
      />
    );

  return (
    <>
      <EvmWalletPrompts />
      {back}
      <PageHeader
        eyebrow={`${PROVIDER_LABEL[market.provider]} · ${CHAIN_LABEL[market.chain]}`}
        title={`${symbol} / ${market.loanSymbol}`}
        lede={
          asset
            ? `Supply ${symbol} as collateral and borrow ${market.loanSymbol}. ${asset.underlyingReference}.`
            : `Borrow ${market.loanSymbol} against ${symbol}.`
        }
        actions={wallet.account ? <EvmWalletControl /> : undefined}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <PositionPanel
            market={market}
            eligibility={eligibility.data}
            loanDecimals={loanDecimals.data}
            capacity={capacity}
          />
          <EligibilityPanel eligibility={eligibility.data} failed={eligibility.isError} />
          <Panel aria-label="Market details">
            <PanelHeader title="Market details" className="pb-2" />
            <Facts
              className="px-5 pb-3"
              rows={[
                {
                  label: "Collateral token",
                  value: (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span>{symbol}</span>
                      <ChainAddress value={market.collateralToken} />
                    </span>
                  ),
                  ...(asset
                    ? { hint: `${asset.tokenStandard} · ${asset.decimals} decimals` }
                    : { hint: "Not in the collateral registry." }),
                },
                ...(asset
                  ? [
                      {
                        label: "Issuer",
                        value: (
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <span>{asset.issuer.name}</span>
                            <RegistryChips asset={asset} />
                          </span>
                        ),
                      },
                    ]
                  : []),
                {
                  label: "Loan token",
                  value: (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span>{market.loanSymbol}</span>
                      <ChainAddress value={market.loanToken} />
                    </span>
                  ),
                },
                {
                  label: "Liquidation LTV",
                  value: <span className="num">{wadPercent(market.lltvWad)}</span>,
                  hint: "Set by the market. Pontis' own borrow limit can be lower.",
                },
                {
                  label: "Available liquidity",
                  value: liquidity,
                  hint: "Supplied by lenders to this market and not yet borrowed.",
                },
                { label: "Venue", value: PROVIDER_LABEL[market.provider] },
                { label: "Chain", value: CHAIN_LABEL[market.chain] },
                { label: "Market ID", value: <span className="num text-[13px]">{market.id}</span> },
              ]}
            />
          </Panel>
        </div>
        <div className="lg:sticky lg:top-[76px]">
          <LendingAction
            market={market}
            asset={asset}
            loanDecimals={loanDecimals.data}
            capacity={capacity.data}
            eligible={eligibility.data?.eligible}
          />
        </div>
      </div>
    </>
  );
}
