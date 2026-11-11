// Markets: the registry as a market table (synthetic prices, mock mode only) next to the real
// registry facts: which pairs an approver has recorded as convertible, and your own conversions.
import type { AssetSummary, Compatibility } from "@pontis/api-types";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, Wallet } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { TokenMark } from "../components/brand.tsx";
import { Donut, Sparkline, StepArea } from "../components/charts.tsx";
import { StateBadge } from "../components/labels.tsx";
import { Span } from "../components/span.tsx";
import { Button, ButtonLink } from "../components/ui/button.tsx";
import {
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  Segmented,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import type { Tone } from "../lib/copy.ts";
import { CLASSIFICATION, STATE } from "../lib/copy.ts";
import { timeAgo, wholeTokenRate } from "../lib/format.ts";
import { pct, usd, usdCompact } from "../lib/market-format.ts";
import type { MarketRow } from "../lib/market-types.ts";
import { keys, useAssets, useMarketAssets, useTransactions } from "../lib/queries.ts";
import { useWallet } from "../wallet/context.tsx";

function Change({ value }: { value: number }) {
  return (
    <span className={cn("num", value >= 0 ? "text-parity" : "text-danger")}>
      <span aria-hidden>{value >= 0 ? "▲ " : "▼ "}</span>
      {pct(value).replace(/^[+−]/, "")}
      <span className="sr-only">{value >= 0 ? " up" : " down"}</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  change,
  series,
  note,
}: {
  label: string;
  value: React.ReactNode;
  change?: number;
  series?: number[];
  note?: string;
}) {
  return (
    <div className="panel flex items-end justify-between gap-4 p-5">
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="num mt-2 text-[28px] leading-none">{value}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-faint">
          {change !== undefined && <Change value={change} />}
          {note}
        </p>
      </div>
      {series && (
        <Sparkline values={series} width={110} height={44} label={`${label}, last 7 days`} />
      )}
    </div>
  );
}

const CELL: Record<Tone, string> = {
  parity: "bg-parity/20 text-parity border-parity/40",
  similar: "bg-similar/15 text-similar border-similar/30",
  danger: "bg-danger/10 text-danger border-danger/25",
  warn: "bg-warn/15 text-warn border-warn/30",
  gold: "",
  ion: "",
  neutral: "",
};
const CELL_LETTER = {
  DIRECT_EQUIVALENT: "=",
  ECONOMICALLY_SIMILAR: "≈",
  INCOMPATIBLE: "×",
  SUSPENDED: "!",
} as const;

function Matrix({
  assets,
  relations,
}: {
  assets: AssetSummary[];
  relations: Map<string, Compatibility>;
}) {
  return (
    <div className="overflow-x-auto px-5 pb-5 pt-4 sm:px-6">
      <div
        className="grid w-max gap-1.5"
        style={{ gridTemplateColumns: `auto repeat(${assets.length}, 56px)` }}
        role="table"
        aria-label="Compatibility between every pair of representations"
      >
        <span />
        {assets.map((a) => (
          <span key={a.id} className="num pb-1 text-center text-[10.5px] text-faint">
            {a.symbol.replace("T", "")}
          </span>
        ))}
        {assets.map((row) => (
          <Fragment key={row.id}>
            <span className="num flex items-center pr-3 text-xs text-muted">{row.symbol}</span>
            {assets.map((col) => {
              if (row.id === col.id)
                return (
                  <span
                    key={col.id}
                    className="size-14 rounded-[10px] bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgb(220_255_232/0.04)_5px_6px)]"
                    aria-hidden
                  />
                );
              const relation = relations.get(`${row.id}>${col.id}`);
              if (!relation) {
                return (
                  <Link
                    key={col.id}
                    to={`/app/compare?from=${row.id}&to=${col.id}`}
                    title={`${row.symbol} and ${col.symbol}: no relationship recorded`}
                    className="grid size-14 place-items-center rounded-[10px] border border-dashed border-line-strong text-faint transition hover:border-gold/50"
                  >
                    <span aria-hidden>·</span>
                    <span className="sr-only">
                      {row.symbol} and {col.symbol}: no relationship recorded
                    </span>
                  </Link>
                );
              }
              const meta = CLASSIFICATION[relation.classification];
              return (
                <Link
                  key={col.id}
                  to={`/app/compare?from=${row.id}&to=${col.id}`}
                  title={`${row.symbol} and ${col.symbol}: ${meta.label}`}
                  className={cn(
                    "grid size-14 place-items-center rounded-[10px] border text-lg transition hover:scale-105",
                    CELL[meta.tone],
                  )}
                >
                  <span aria-hidden>{CELL_LETTER[relation.classification]}</span>
                  <span className="sr-only">
                    {row.symbol} and {col.symbol}: {meta.label}
                  </span>
                </Link>
              );
            })}
          </Fragment>
        ))}
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {(Object.keys(CELL_LETTER) as (keyof typeof CELL_LETTER)[]).map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-5 place-items-center rounded-[5px] border text-[11px]",
                CELL[CLASSIFICATION[key].tone],
              )}
              aria-hidden
            >
              {CELL_LETTER[key]}
            </span>
            {CLASSIFICATION[key].label}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Filter = "all" | "convertible" | "gold" | "silver";

export function Overview() {
  const wallet = useWallet();
  const assets = useAssets();
  const market = useMarketAssets();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useMemo(() => assets.data ?? [], [assets.data]);
  const compat = useQueries({
    queries: list.map((a) => ({
      queryKey: keys.compatibility(a.id),
      queryFn: () => api.compatibility(a.id),
    })),
  });
  const transactions = useTransactions(wallet.accountId);

  const relations = new Map<string, Compatibility>();
  list.forEach((asset, i) =>
    compat[i]?.data?.forEach((r) => relations.set(`${asset.id}>${r.counterpartId}`, r)),
  );
  const parityIds = new Set(
    [...relations.entries()].filter(([, r]) => r.parityEnabled).map(([k]) => k.split(">")[0]!),
  );
  const parityPairs = [...relations.entries()].filter(
    ([key, r]) => r.parityEnabled && key.split(">")[0]! < r.counterpartId,
  );
  const featured = parityPairs[0];
  const featuredFrom = featured ? list.find((a) => a.id === featured[0].split(">")[0]) : undefined;
  const featuredTo = featured ? list.find((a) => a.id === featured[1].counterpartId) : undefined;
  const claims = new Set(list.map((a) => a.canonicalAssetId)).size;

  const byId = new Map(list.map((a) => [a.id, a]));
  const rows = (market.data ?? []).filter((r) => {
    if (filter === "convertible") return parityIds.has(r.id);
    if (filter === "gold") return /gold/i.test(byId.get(r.id)?.canonicalAssetName ?? r.name);
    if (filter === "silver") return /silver/i.test(byId.get(r.id)?.canonicalAssetName ?? r.name);
    return true;
  });

  const all = market.data ?? [];
  const totalCap = all.reduce((s, r) => s + r.marketCapUsd, 0);
  const totalVol = all.reduce((s, r) => s + r.volume24hUsd, 0);
  // Weighted 24h change and a summed 7 day line for the headline cards.
  const capChange =
    totalCap === 0 ? 0 : all.reduce((s, r) => s + r.change24h * r.marketCapUsd, 0) / totalCap;
  const capSeries =
    all.length === 0
      ? []
      : (all[0] as MarketRow).sparkline.map((_, i) =>
          all.reduce((s, r) => s + (r.sparkline[i] ?? 0) * (r.marketCapUsd / r.priceUsd), 0),
        );
  const movers = [...all].sort((a, b) => b.change24h - a.change24h);

  const txs = transactions.data ?? [];
  const slices = (
    ["SETTLED", "SUBMITTED", "EXPIRED", "FAILED", "REQUIRES_RECONCILIATION"] as const
  ).map((state) => ({
    label: STATE[state].label,
    tone: STATE[state].tone === "neutral" ? ("ion" as Tone) : STATE[state].tone,
    value: txs.filter((t) => t.state === state).length,
  }));
  const settled = txs
    .filter((t) => t.settledAt)
    .sort((x, y) => x.settledAt!.localeCompare(y.settledAt!));
  const series =
    settled.length > 0
      ? [
          { at: Date.parse(settled[0]!.createdAt), value: 0 },
          ...settled.map((t, i) => ({ at: Date.parse(t.settledAt!), value: i + 1 })),
          { at: Date.now(), value: settled.length },
        ]
      : [];

  if (assets.isError)
    return (
      <Panel>
        <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
      </Panel>
    );

  return (
    <>
      <PageHeader
        eyebrow="Markets"
        title={
          <>
            Tokenized real-world assets,{" "}
            <em className="text-gold-grad">and who converts with whom</em>
          </>
        }
        lede="Every representation on NEAR Testnet with its synthetic market data, and the pairs an approver has recorded as convertible."
        actions={
          <ButtonLink to="/app/convert">
            Convert <ArrowUpRight className="size-4" aria-hidden />
          </ButtonLink>
        }
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Synthetic market cap"
          value={market.isLoading ? "…" : usdCompact(totalCap)}
          change={capChange}
          series={capSeries}
          note="24h"
        />
        <StatCard
          label="24h volume"
          value={market.isLoading ? "…" : usdCompact(totalVol)}
          note="across all representations"
        />
        <StatCard
          label="Representations"
          value={assets.isLoading ? "…" : list.length}
          note={`${claims} canonical claims`}
        />
        <StatCard
          label="Parity routes"
          value={compat.some((c) => c.isLoading) ? "…" : parityPairs.length}
          note="approved direct-equivalent pairs"
        />
      </div>

      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-[18px] font-medium tracking-tight">Tokenized assets</h2>
            <p className="mt-1 text-[13px] text-muted">
              Prices and volumes are{" "}
              <Chip tone="warn" className="!h-5 align-middle !text-[10.5px]">
                synthetic
              </Chip>{" "}
              and generated for the demo.
            </p>
          </div>
          <Segmented<Filter>
            label="Filter assets"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "convertible", label: "Convertible" },
              { value: "gold", label: "Gold" },
              { value: "silver", label: "Silver" },
            ]}
          />
        </div>
        {market.isError ? (
          <ErrorState
            error={market.error}
            title="Market data is not available"
            onRetry={() => void market.refetch()}
          />
        ) : market.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No assets match this filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-faint">
                  <th className="w-12 px-5 py-3 font-medium">#</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 text-right font-medium">Price</th>
                  <th className="px-3 py-3 text-right font-medium">24h %</th>
                  <th className="px-3 py-3 text-right font-medium">7d %</th>
                  <th className="px-3 py-3 text-right font-medium">Market cap</th>
                  <th className="px-3 py-3 text-right font-medium">Volume (24h)</th>
                  <th className="px-3 py-3 text-right font-medium">Last 7 days</th>
                  <th className="px-5 py-3 text-right font-medium">Route</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const asset = byId.get(row.id);
                  return (
                    <tr
                      key={row.id}
                      className="group border-b border-line/70 transition last:border-0 hover:bg-white/[0.025]"
                    >
                      <td className="num px-5 py-4 text-faint">{i + 1}</td>
                      <td className="px-3 py-4">
                        <Link to={`/app/assets/${row.id}`} className="flex items-center gap-3">
                          <TokenMark symbol={row.symbol} size={34} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="font-medium group-hover:text-gold">{row.name}</span>
                              <span className="num text-xs text-faint">{row.symbol}</span>
                            </span>
                            <span className="block text-xs text-muted">
                              {asset?.canonicalAssetName} · {asset?.issuer.name}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="num px-3 py-4 text-right">{usd(row.priceUsd)}</td>
                      <td className="px-3 py-4 text-right">
                        <Change value={row.change24h} />
                      </td>
                      <td className="px-3 py-4 text-right">
                        <Change value={row.change7d} />
                      </td>
                      <td className="num px-3 py-4 text-right">{usdCompact(row.marketCapUsd)}</td>
                      <td className="num px-3 py-4 text-right">{usdCompact(row.volume24hUsd)}</td>
                      <td className="px-3 py-4">
                        <div className="flex justify-end">
                          <Sparkline values={row.sparkline} label={`${row.symbol}, last 7 days`} />
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {parityIds.has(row.id) ? (
                          <Link
                            to={`/app/convert?from=${row.id}`}
                            className="inline-flex h-8 items-center rounded-full border border-gold/40 px-4 text-[13px] text-gold transition hover:bg-gold/10"
                          >
                            Convert
                          </Link>
                        ) : (
                          <span className="text-xs text-faint">Registry only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel variant="gold" className="p-5 sm:p-6">
          <p className="eyebrow mb-1">Open route</p>
          {featured && featuredFrom && featuredTo ? (
            <>
              <h2 className="text-[17px] font-medium">
                {featuredFrom.symbol} and {featuredTo.symbol} are direct equivalents
              </h2>
              <Span
                className="mt-4"
                from={featuredFrom.symbol}
                to={featuredTo.symbol}
                state="DIRECT_EQUIVALENT"
                keystone={`1 : ${wholeTokenRate(featured[1].ratio, featuredFrom.decimals, featuredTo.decimals)}`}
              />
              <p className="mt-4 text-[13px] text-muted">{featured[1].rationale}</p>
              <div className="mt-5 flex gap-3">
                <ButtonLink
                  to={`/app/convert?from=${featuredFrom.id}&to=${featuredTo.id}`}
                  className="flex-1"
                >
                  Convert
                </ButtonLink>
                <ButtonLink
                  to={`/app/compare?from=${featuredFrom.id}&to=${featuredTo.id}`}
                  variant="secondary"
                  className="flex-1"
                >
                  Why they match
                </ButtonLink>
              </div>
            </>
          ) : compat.some((c) => c.isLoading) || assets.isLoading ? (
            <Skeleton className="mt-3 h-56" />
          ) : (
            <p className="mt-2 text-sm text-muted">
              No pair is currently approved as a direct equivalent, so no conversion route is open.
            </p>
          )}
        </Panel>

        <Panel>
          <PanelHeader eyebrow="24h" title="Top movers" />
          {market.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-40" />
            </div>
          ) : movers.length === 0 ? (
            <EmptyState title="No market data" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2 pt-3 sm:px-6">
              {movers.map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/app/assets/${row.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:text-gold"
                  >
                    <span className="flex items-center gap-3">
                      <TokenMark symbol={row.symbol} size={28} />
                      <span className="num text-sm">{row.symbol}</span>
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="num text-sm text-muted">{usd(row.priceUsd)}</span>
                      <Change value={row.change24h} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader eyebrow="Compatibility" title="Who converts with whom" />
          {assets.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-48" />
            </div>
          ) : (
            <Matrix assets={list} relations={relations} />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow={wallet.accountId ? "Your account" : "Activity"}
            title="Conversions"
            action={
              wallet.accountId ? (
                <Link
                  to="/app/activity"
                  className="link inline-flex items-center gap-1 text-[13px]"
                >
                  All activity <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : undefined
            }
          />
          {!wallet.accountId ? (
            <EmptyState
              icon={<Wallet className="size-5" aria-hidden />}
              title="Connect a wallet to see your conversions"
              body="Activity is listed per account. There is no protocol-wide feed."
              action={
                <Button
                  onClick={() => void wallet.connect()}
                  loading={wallet.connecting}
                  disabled={!wallet.ready}
                >
                  Connect wallet
                </Button>
              }
            />
          ) : transactions.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-48" />
            </div>
          ) : txs.length === 0 ? (
            <EmptyState
              title="No conversions yet"
              action={
                <ButtonLink to="/app/convert" variant="secondary">
                  Start a conversion
                </ButtonLink>
              }
            />
          ) : (
            <div className="px-5 pb-5 pt-5 sm:px-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Donut slices={slices} centerLabel="total" centerValue={String(txs.length)} />
                <div>
                  <p className="eyebrow mb-2">Settled, cumulative</p>
                  <StepArea
                    points={series}
                    label={`${settled.length} settled conversions over time`}
                  />
                </div>
              </div>
              <ul className="mt-5 divide-y divide-line border-t border-line">
                {txs.slice(0, 4).map((tx) => {
                  const from = list.find((a) => a.id === tx.quote.fromId);
                  const to = list.find((a) => a.id === tx.quote.toId);
                  return (
                    <li key={tx.id}>
                      <Link
                        to={`/app/activity/${tx.id}`}
                        className="group flex items-center justify-between gap-3 py-3"
                      >
                        <span className="min-w-0 text-sm">
                          <Amount
                            value={tx.quote.amountIn}
                            decimals={from?.decimals ?? 0}
                            symbol={from?.symbol ?? tx.quote.fromId}
                            compact
                          />
                          <ArrowRight className="mx-2 inline size-3.5 text-faint" aria-hidden />
                          <Amount
                            value={tx.quote.amountOut}
                            decimals={to?.decimals ?? 0}
                            symbol={to?.symbol ?? tx.quote.toId}
                            compact
                          />
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="hidden text-xs text-faint sm:inline">
                            {timeAgo(tx.createdAt)}
                          </span>
                          <StateBadge state={tx.state} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
