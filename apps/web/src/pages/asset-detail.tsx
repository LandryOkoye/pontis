// Asset detail, laid out like a market terminal page: identity and key figures on the left, the
// price chart with markets and tokens tables in the middle, and the conversion panel on the right.
// Issuer, canonical claim and token representation stay three separate records under "About"
// (brief §6, §15.1). Market figures are synthetic and labelled as such.
import type { Asset, Compatibility } from "@pontis/api-types";
import { ArrowLeft, ArrowRight, Building2, Coins, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TokenMark } from "../components/brand.tsx";
import { PriceChart } from "../components/charts.tsx";
import { EvidenceTiers } from "../components/evidence.tsx";
import { ClassificationBadge, Hallmark, RecordBadge } from "../components/labels.tsx";
import { ButtonLink } from "../components/ui/button.tsx";
import {
  Account,
  Chip,
  EmptyState,
  ErrorState,
  Facts,
  Panel,
  PanelHeader,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { cn } from "../lib/cn.ts";
import { CLASSIFICATION } from "../lib/copy.ts";
import { formatDate, ratioText, wholeTokenRate } from "../lib/format.ts";
import { compact, integer, pct, usd, usdCompact } from "../lib/market-format.ts";
import type { ChartRange, MarketAsset } from "../lib/market-types.ts";
import { CHART_RANGES } from "../lib/market-types.ts";
import {
  useAsset,
  useAssets,
  useCompatibility,
  useMarketAsset,
  useMarketAssets,
  useMarketChart,
} from "../lib/queries.ts";

function SectionTitle({
  icon: Icon,
  index,
  title,
  note,
}: {
  icon: typeof Coins;
  index: string;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-4 px-5 pt-5 sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-panel-2 text-muted">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div>
        <p className="eyebrow">{index}</p>
        <h2 className="text-[17px] font-medium tracking-tight">{title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{note}</p>
      </div>
    </div>
  );
}

function RelationshipRow({
  selfId,
  selfSymbol,
  selfDecimals,
  relation,
}: {
  selfId: string;
  selfSymbol: string;
  selfDecimals: number;
  relation: Compatibility;
}) {
  const assets = useAssets();
  const other = assets.data?.find((a) => a.id === relation.counterpartId);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
      <TokenMark symbol={other?.symbol ?? relation.counterpartId} size={36} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{other?.symbol ?? relation.counterpartId}</span>
          <ClassificationBadge value={relation.classification} />
          {relation.status !== "approved" && <Chip tone="warn">{relation.status}</Chip>}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {relation.parityEnabled && other ? (
            <>
              Converts at{" "}
              <span className="num text-text">
                1 {selfSymbol} = {wholeTokenRate(relation.ratio, selfDecimals, other.decimals)}{" "}
                {other.symbol}
              </span>{" "}
              · v{relation.version}
            </>
          ) : (
            CLASSIFICATION[relation.classification].short
          )}
        </p>
      </div>
      <Link
        to={`/app/compare?from=${selfId}&to=${relation.counterpartId}`}
        className="link inline-flex items-center gap-1.5 text-[13px]"
      >
        Why <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  );
}

type Tab = "chart" | "markets" | "tokens" | "about";
const TABS: { value: Tab; label: string }[] = [
  { value: "chart", label: "Chart" },
  { value: "markets", label: "Markets" },
  { value: "tokens", label: "Tokens" },
  { value: "about", label: "About" },
];

function Delta({ value }: { value: number }) {
  return (
    <span className={cn("num", value >= 0 ? "text-parity" : "text-danger")}>
      <span aria-hidden>{value >= 0 ? "▲ " : "▼ "}</span>
      {pct(value).replace(/^[+−]/, "")}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="num mt-1 text-[15px]">{children}</p>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="flex min-w-0 justify-end text-[13px]">{children}</dd>
    </div>
  );
}

function Pill({ children, to }: { children: React.ReactNode; to?: string }) {
  const cls =
    "inline-flex max-w-full items-center truncate rounded-md bg-panel-2 px-2 py-0.5 text-[13px] text-text";
  return to ? (
    <Link to={to} className={cn(cls, "hover:text-text")}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

function RangeBar({ low, high, price }: { low: number; high: number; price: number }) {
  const at = Math.max(0, Math.min(1, (price - low) / (high - low || 1))) * 100;
  return (
    <div className="px-4 pb-4 pt-3">
      <p className="mb-2 text-center text-[12px] text-muted">52-week range (synthetic)</p>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="num">{usd(low)}</span>
        <span className="num">{usd(high)}</span>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-panel-3"
        role="meter"
        aria-label="Price within its 52 week range"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(at)}
      >
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-text"
          style={{ left: `${at}%` }}
        />
      </div>
    </div>
  );
}

function LeftRail({ a, m }: { a: Asset; m: MarketAsset | undefined }) {
  return (
    <aside className="space-y-5" aria-label="Key figures">
      <div>
        <div className="flex items-center gap-3">
          <TokenMark symbol={a.symbol} size={40} />
          <div className="min-w-0">
            <h1 className="num text-[24px] font-medium leading-tight tracking-tight">{a.symbol}</h1>
            <p className="truncate text-[13px] text-muted">
              {a.name.replace(/^SYNTHETIC TEST /, "")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Hallmark synthetic={a.synthetic} verification={a.verificationStatus} />
          <RecordBadge status={a.status} />
        </div>
        <div className="mt-5">
          {m ? (
            <>
              <p className="num flex flex-wrap items-baseline gap-3 text-[34px] font-light leading-none tracking-tight">
                {usd(m.priceUsd)}
                <span className="text-sm">
                  <Delta value={m.change24h} /> <span className="text-faint">24h</span>
                </span>
              </p>
              <p className="mt-2 text-[12.5px] text-faint">
                Synthetic price · 1 {a.symbol} = {compact(m.canonicalUnitsPerToken)} canonical{" "}
                {m.canonicalUnitsPerToken === 1 ? "unit" : "units"}
              </p>
            </>
          ) : (
            <Skeleton className="h-14" />
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {m ? (
          <div className="grid grid-cols-2 divide-x divide-line">
            <div className="divide-y divide-line">
              <Stat label="Market cap">{usdCompact(m.marketCapUsd)}</Stat>
              <Stat label="FDV">{usdCompact(m.fdvUsd)}</Stat>
              <Stat label="Circulating">{compact(m.circulatingSupply)}</Stat>
              <Stat label="Holders">{integer(m.holders)}</Stat>
            </div>
            <div className="divide-y divide-line">
              <Stat label="Volume (24h)">{usdCompact(m.volume24hUsd)}</Stat>
              <Stat label="Vol / Mkt cap">{m.volumeToMarketCap.toFixed(4)}</Stat>
              <Stat label="Test vault (TVL)">{usdCompact(m.tvlUsd)}</Stat>
              <Stat label="Change (7d)">
                <Delta value={m.change7d} />
              </Stat>
            </div>
          </div>
        ) : (
          <Skeleton className="h-64" />
        )}
        {m && <RangeBar low={m.low52w} high={m.high52w} price={m.priceUsd} />}
      </div>

      <dl className="divide-y divide-line/60 px-1">
        <MetaRow label="Contract">
          <Account id={a.accountId} max={22} />
        </MetaRow>
        <MetaRow label="Standard">
          <Pill>{a.standard}</Pill>
        </MetaRow>
        <MetaRow label="Network">
          <Pill>NEAR {a.network}</Pill>
        </MetaRow>
        <MetaRow label="Asset type">
          <Pill>{a.canonicalAsset.category}</Pill>
        </MetaRow>
        <MetaRow label="Canonical claim">
          <Pill>{a.canonicalAsset.name}</Pill>
        </MetaRow>
        <MetaRow label="Issuer">
          <Pill to={`/app/issuers/${a.issuer.id}`}>{a.issuer.name}</Pill>
        </MetaRow>
        <MetaRow label="Decimals">
          <Pill>{a.decimals}</Pill>
        </MetaRow>
        <MetaRow label="Unit multiplier">
          <Pill>{ratioText(a.unitMultiplier)}</Pill>
        </MetaRow>
        <MetaRow label="Registered">
          <Pill>{m ? formatDate(m.listedAt) : "…"}</Pill>
        </MetaRow>
        <MetaRow label="Last reviewed">
          <Pill>{a.lastReviewedAt ? formatDate(a.lastReviewedAt) : "Never"}</Pill>
        </MetaRow>
      </dl>
    </aside>
  );
}

function ChartTab({ a, m }: { a: Asset; m: MarketAsset | undefined }) {
  const [range, setRange] = useState<ChartRange>("24h");
  const [mode, setMode] = useState<"price" | "cap">("price");
  const chart = useMarketChart(a.id, range);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-ink-2 p-1 text-[13px]">
          {(["price", "cap"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "h-8 rounded-lg px-3.5 transition",
                mode === value ? "bg-panel-3 text-text" : "text-muted hover:text-text",
              )}
            >
              {value === "price" ? "Price" : "Mkt Cap"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="warn" className="!h-7">
            Synthetic data
          </Chip>
          <div
            role="tablist"
            aria-label="Chart range"
            className="inline-flex rounded-xl border border-line bg-ink-2 p-1 text-[13px]"
          >
            {CHART_RANGES.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={range === value}
                onClick={() => setRange(value)}
                className={cn(
                  "h-8 rounded-lg px-3 transition",
                  range === value
                    ? "bg-panel-3 font-medium text-text"
                    : "text-muted hover:text-text",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Panel className="p-3 sm:p-4">
        {chart.isError ? (
          <ErrorState
            error={chart.error}
            title="Market data is not available"
            onRetry={() => void chart.refetch()}
          />
        ) : !chart.data ? (
          <Skeleton className="h-[400px]" />
        ) : (
          <PriceChart
            points={chart.data.points}
            range={range}
            multiplier={mode === "cap" && m ? m.circulatingSupply : 1}
            ariaLabel={`${a.symbol} ${mode === "cap" ? "market cap" : "price"}, ${range}, synthetic data`}
          />
        )}
      </Panel>
    </div>
  );
}

function MarketsTable({ a }: { a: Asset }) {
  const detail = useMarketAsset(a.id);
  const pairs = detail.data?.pairs ?? [];
  return (
    <section aria-label={`${a.symbol} markets`}>
      <h2 className="mb-3 flex flex-wrap items-baseline gap-3 text-[22px] font-medium tracking-tight">
        {a.symbol} Markets
        <span className="flex items-center gap-1.5 text-[13px] font-normal text-muted">
          <Coins className="size-3.5 text-faint" aria-hidden /> Pontis Test Vault
        </span>
      </h2>
      <Panel className="overflow-hidden">
        {detail.isError ? (
          <ErrorState error={detail.error} title="Market data is not available" />
        ) : !detail.data ? (
          <Skeleton className="h-40" />
        ) : pairs.length === 0 ? (
          <EmptyState title="No pairs" body="This representation has no registered counterparts." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-faint">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-3 py-3 font-medium">Pair</th>
                  <th className="px-3 py-3 text-right font-medium">Price</th>
                  <th className="px-3 py-3 text-right font-medium">Depth</th>
                  <th className="px-3 py-3 text-right font-medium">Vol (24h)</th>
                  <th className="px-3 py-3 text-right font-medium">Vol %</th>
                  <th className="px-5 py-3 text-right font-medium">Route</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p, i) => (
                  <tr key={p.pair} className="border-b border-line/70 last:border-0">
                    <td className="num px-5 py-4 text-faint">{i + 1}</td>
                    <td className="num px-3 py-4">{p.pair}</td>
                    <td className="num px-3 py-4 text-right">{usd(p.priceUsd)}</td>
                    <td className="num px-3 py-4 text-right">
                      {p.depthUsd ? usdCompact(p.depthUsd) : "—"}
                    </td>
                    <td className="num px-3 py-4 text-right">
                      {p.volume24hUsd ? usdCompact(p.volume24hUsd) : "—"}
                    </td>
                    <td className="num px-3 py-4 text-right">
                      {p.volumeShare ? `${(p.volumeShare * 100).toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Chip tone={p.kind === "Parity route" ? "parity" : "neutral"} dot>
                        {p.kind}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}

function TokensTable({ a }: { a: Asset }) {
  const assets = useAssets();
  const market = useMarketAssets();
  const compat = useCompatibility(a.id);
  const siblings = (assets.data ?? []).filter((x) => x.canonicalAssetId === a.canonicalAsset.id);
  const rows = siblings.map((x) => ({
    asset: x,
    market: market.data?.find((r) => r.id === x.id),
    relation: compat.data?.find((r) => r.counterpartId === x.id),
  }));
  return (
    <section aria-label="Representations of this claim">
      <h2 className="mb-3 text-[22px] font-medium tracking-tight">
        {a.canonicalAsset.name} Tokens
      </h2>
      <Panel className="overflow-hidden">
        {!assets.data ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-faint">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-3 py-3 font-medium">Token</th>
                  <th className="px-3 py-3 text-right font-medium">Price</th>
                  <th className="px-3 py-3 text-right font-medium">Market cap</th>
                  <th className="px-3 py-3 text-right font-medium">Vol (24h)</th>
                  <th className="px-5 py-3 text-right font-medium">Relation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ asset, market: row, relation }, i) => (
                  <tr key={asset.id} className="border-b border-line/70 last:border-0">
                    <td className="num px-5 py-4 text-faint">{i + 1}</td>
                    <td className="px-3 py-4">
                      <Link
                        to={`/app/assets/${asset.id}`}
                        className="flex items-center gap-3 hover:text-text"
                      >
                        <TokenMark symbol={asset.symbol} size={28} />
                        <span className="num">{asset.symbol}</span>
                        {asset.id === a.id ? (
                          <Chip>this token</Chip>
                        ) : (
                          <span className="text-xs text-faint">{asset.issuer.name}</span>
                        )}
                      </Link>
                    </td>
                    <td className="num px-3 py-4 text-right">{row ? usd(row.priceUsd) : "—"}</td>
                    <td className="num px-3 py-4 text-right">
                      {row ? usdCompact(row.marketCapUsd) : "—"}
                    </td>
                    <td className="num px-3 py-4 text-right">
                      {row ? usdCompact(row.volume24hUsd) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {asset.id === a.id ? (
                        <span className="text-faint">—</span>
                      ) : relation ? (
                        <ClassificationBadge value={relation.classification} />
                      ) : (
                        <span className="text-xs text-faint">Not recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}

function AboutTab({ a }: { a: Asset }) {
  const claim = a.canonicalAsset;
  const text = (value: string | null) => value ?? <span className="text-faint">Not stated</span>;
  return (
    <div className="space-y-5">
      <Panel aria-label="Canonical claim">
        <SectionTitle
          icon={ScrollText}
          index={`01 · Canonical claim · ${claim.id.toUpperCase()}`}
          title={claim.name}
          note="What the token is a claim on. Shared by every representation of it."
        />
        <Facts
          className="px-5 pb-3 pt-3 sm:px-6"
          rows={[
            { label: "Claim", value: claim.claimDescription },
            { label: "Unit", value: claim.unitDefinition },
            { label: "Category", value: claim.category },
            { label: "Economic rights", value: claim.economicRights },
            { label: "Legal structure", value: claim.legalClaimStructure },
            { label: "Redemption", value: claim.redemptionTerms },
            { label: "Valuation method", value: text(claim.valuationMethod) },
            { label: "Jurisdiction", value: text(claim.jurisdiction) },
            { label: "Eligibility", value: claim.eligibilityRestrictions },
          ]}
        />
        {claim.riskDisclosures.length > 0 && (
          <div className="mx-5 mb-5 rounded-lg border border-warn/30 bg-warn/[0.06] p-4 sm:mx-6">
            <p className="eyebrow mb-2 !text-warn">Risk disclosures</p>
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
              {claim.riskDisclosures.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel aria-label="Token representation">
        <SectionTitle
          icon={Coins}
          index="02 · Token representation"
          title={`${a.symbol} on NEAR Testnet`}
          note="One token contract that represents the claim above."
        />
        <Facts
          className="px-5 pb-3 pt-3 sm:px-6"
          rows={[
            { label: "Contract", value: <Account id={a.accountId} max={40} /> },
            { label: "Standard", value: <span className="num">{a.standard}</span> },
            { label: "Network", value: a.network },
            { label: "Custody", value: a.custodyDescription },
            { label: "Redemption mechanism", value: a.redemptionMechanism },
            {
              label: "Transfer policy",
              value: a.transferPolicySummary,
              hint: a.allowlistRequired ? "An allowlisted account is required to convert." : "",
            },
            {
              label: "Cross-chain status",
              value:
                a.bridgeStatus === "none"
                  ? "Native to this network; not wrapped or moved from another chain"
                  : a.bridgeStatus,
            },
            {
              label: "Admin capabilities",
              value: (
                <span className="flex flex-wrap gap-1.5">
                  {a.adminCapabilities.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </span>
              ),
              hint: "What the token owner can do unilaterally.",
            },
          ].map(({ hint, ...row }) => (hint ? { ...row, hint } : row))}
        />
      </Panel>

      <Panel aria-label="Issuer">
        <SectionTitle
          icon={Building2}
          index="03 · Issuer"
          title={a.issuer.name}
          note="Who issued this representation."
        />
        <div className="flex items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <Hallmark synthetic={a.issuer.synthetic} verification={a.issuer.verificationStatus} />
            <RecordBadge status={a.issuer.status} />
          </div>
          <Link
            to={`/app/issuers/${a.issuer.id}`}
            className="link inline-flex items-center gap-1.5 text-[13px]"
          >
            Issuer record <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </Panel>

      <Panel aria-label="Evidence">
        <PanelHeader eyebrow="Evidence for this representation" title="Who says so" />
        <p className="px-5 pt-1 text-[13px] text-muted sm:px-6">
          Registered is not verified. Each reference is a URI and a SHA-256 of the document, filed
          under who produced it.
        </p>
        <div className="p-5 sm:p-6">
          <EvidenceTiers evidence={a.evidence} />
        </div>
      </Panel>
    </div>
  );
}

const TILES = [
  ["60 s", "Lifetime of a signed quote, bound to your account."],
  ["10 bps", "Protocol fee on this test deployment, shown on every quote."],
  ["0", "Keys held by the backend. Your wallet signs."],
  ["Refund", "Failed validation or payout returns the full input."],
];

function RightRail({
  a,
  relations,
  loading,
}: {
  a: Asset;
  relations: Compatibility[] | undefined;
  loading: boolean;
}) {
  const assets = useAssets();
  const parity = relations?.filter((r) => r.parityEnabled) ?? [];
  const target = parity[0];
  const other = assets.data?.find((x) => x.id === target?.counterpartId);
  return (
    <aside className="space-y-5" aria-label="Convert">
      <Panel className="p-5">
        <h2 className="text-[17px] font-medium tracking-tight">Convert {a.symbol}</h2>
        {target && other ? (
          <>
            <p className="mt-1 text-[13px] text-muted">
              Parity conversion at the approved ratio. A signed quote is valid for 60 seconds.
            </p>
            <dl className="mt-4 divide-y divide-line/60 rounded-2xl border border-line bg-ink-2/60 px-4 text-[13px]">
              <MetaRow label="You send">
                <span className="num">{a.symbol}</span>
              </MetaRow>
              <MetaRow label="You receive">
                <span className="num">{other.symbol}</span>
              </MetaRow>
              <MetaRow label="Approved ratio">
                <span className="num">
                  1 {a.symbol} = {wholeTokenRate(target.ratio, a.decimals, other.decimals)}{" "}
                  {other.symbol}
                </span>
              </MetaRow>
              <MetaRow label="Version">
                <span className="num">v{target.version}</span>
              </MetaRow>
            </dl>
            <ButtonLink
              to={`/app/convert?from=${a.id}&to=${other.id}`}
              size="lg"
              className="mt-4 w-full"
            >
              Get a signed quote <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              to={`/app/compare?from=${a.id}&to=${other.id}`}
              variant="secondary"
              className="mt-2 w-full"
            >
              Why they match
            </ButtonLink>
          </>
        ) : loading ? (
          <Skeleton className="mt-4 h-44" />
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              No approved direct-equivalent pair, so {a.symbol} has no conversion route. It is
              listed for discovery only.
            </p>
            <ButtonLink
              to={`/app/compare?from=${a.id}`}
              variant="secondary"
              className="mt-4 w-full"
            >
              Compare with another token
            </ButtonLink>
          </>
        )}
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Compatibility" title="Relationships" />
        {!relations ? (
          <div className="p-5">
            <Skeleton className="h-16" />
          </div>
        ) : relations.length === 0 ? (
          <EmptyState
            title="No relationships recorded"
            body="Without an approved DIRECT_EQUIVALENT relationship there is no conversion route."
          />
        ) : (
          <ul className="divide-y divide-line px-5 pb-1">
            {relations.map((relation) => (
              <RelationshipRow
                key={relation.id}
                selfId={a.id}
                selfSymbol={a.symbol}
                selfDecimals={a.decimals}
                relation={relation}
              />
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map(([value, note]) => (
          <div key={value} className="glass-card !rounded-2xl p-4">
            <p className="text-[26px] font-light leading-none tracking-tight text-em-400">
              {value}
            </p>
            <p className="mt-2 text-[12px] leading-snug text-muted">{note}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function AssetDetail() {
  const { id } = useParams();
  const asset = useAsset(id);
  const compatibility = useCompatibility(id);
  const market = useMarketAsset(id);
  const [tab, setTab] = useState<Tab>("chart");

  if (asset.isError) {
    return (
      <Panel>
        <ErrorState
          error={asset.error}
          title="This asset could not be loaded"
          onRetry={() => void asset.refetch()}
        />
      </Panel>
    );
  }
  if (!asset.data) {
    return (
      <div aria-busy="true" className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <Skeleton className="h-[640px]" />
        <Skeleton className="h-[640px]" />
        <Skeleton className="h-[640px]" />
      </div>
    );
  }

  const a = asset.data;
  const m = market.data?.asset;

  return (
    <>
      <Link
        to="/app"
        className="mb-5 inline-flex items-center gap-2 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Markets
      </Link>

      <div className="grid items-start gap-8 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <LeftRail a={a} m={m} />

        <div className="min-w-0">
          <div
            role="tablist"
            aria-label="Asset sections"
            className="mb-5 flex gap-1 border-b border-line"
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "-mb-px border-b-2 px-4 pb-3 pt-1 text-[14px] transition",
                  tab === t.value
                    ? "border-gold text-text"
                    : "border-transparent text-muted hover:text-text",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "chart" && (
            <div className="space-y-10">
              <ChartTab a={a} m={m} />
              <MarketsTable a={a} />
              <TokensTable a={a} />
            </div>
          )}
          {tab === "markets" && <MarketsTable a={a} />}
          {tab === "tokens" && <TokensTable a={a} />}
          {tab === "about" && <AboutTab a={a} />}
        </div>

        <RightRail a={a} relations={compatibility.data} loading={compatibility.isLoading} />
      </div>
    </>
  );
}
