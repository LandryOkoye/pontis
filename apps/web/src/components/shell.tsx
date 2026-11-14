// App shell: a fixed sidebar with grouped navigation and chain status, a slim top bar with the
// global figures (real chain state plus synthetic market totals) and the wallet, and a tab bar
// on mobile.
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeftRight,
  Building2,
  GitCompareArrows,
  Landmark,
  LineChart,
  Scale,
  Wallet,
} from "lucide-react";
import { Suspense } from "react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router-dom";
import { cn } from "../lib/cn.ts";
import { isMock } from "../lib/config.ts";
import { groupDigits } from "../lib/format.ts";
import { usdCompact } from "../lib/market-format.ts";
import { useAssets, useHealth, useMarketAssets } from "../lib/queries.ts";
import { Wordmark } from "./brand.tsx";
import { Skeleton } from "./ui/primitives.tsx";
import { WalletButton } from "./wallet-button.tsx";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const MARKETS: Item = { to: "/app", label: "Markets", icon: LineChart, end: true };
const ASSETS: Item = { to: "/app/assets", label: "Assets", icon: Landmark };
const CONVERT: Item = { to: "/app/convert", label: "Convert", icon: ArrowLeftRight };
const ACTIVITY: Item = { to: "/app/activity", label: "Activity", icon: Activity };
const WALLET: Item = { to: "/app/wallet", label: "Wallet", icon: Wallet };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Registry",
    items: [
      MARKETS,
      ASSETS,
      { to: "/app/issuers", label: "Issuers", icon: Building2 },
      { to: "/app/compare", label: "Compare", icon: GitCompareArrows },
    ],
  },
  { label: "Conversion", items: [CONVERT, ACTIVITY, WALLET] },
  {
    label: "Operations",
    items: [{ to: "/app/reconciliation", label: "Reconciliation", icon: Scale }],
  },
];
const MOBILE: Item[] = [MARKETS, ASSETS, CONVERT, ACTIVITY, WALLET];

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap text-[13px]">
      <span className="text-faint">{label}</span>
      <span className="num text-text">{children}</span>
    </span>
  );
}

/** Chain and API state. All of it is real; none of it is market data. */
function NetworkStatus() {
  const health = useHealth();
  const ok = health.data?.status === "ok";
  const rows: [string, string][] = [
    [
      "Block",
      typeof health.data?.chainHeight === "number"
        ? groupDigits(String(health.data.chainHeight))
        : "—",
    ],
    [
      "Indexer lag",
      typeof health.data?.indexerLagBlocks === "number"
        ? `${health.data.indexerLagBlocks} blocks`
        : "—",
    ],
  ];
  return (
    <div className="border-t border-line px-5 py-4 text-[12.5px]">
      <p className="flex items-center justify-between">
        <span className="font-medium text-text">NEAR Testnet</span>
        <span className="flex items-center gap-1.5 text-muted">
          <span
            className={cn(
              "size-1.5 rounded-full",
              health.isError ? "bg-danger" : ok ? "bg-parity" : "bg-warn",
            )}
            aria-hidden
          />
          API {health.isError ? "unreachable" : (health.data?.status ?? "…")}
        </span>
      </p>
      <dl className="mt-2.5 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-faint">{label}</dt>
            <dd className="num text-muted">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3">
          <dt className="text-faint">Data</dt>
          <dd
            className="text-muted"
            title={isMock ? "Running on local fixtures with a simulated wallet." : undefined}
          >
            {isMock ? "Mock fixtures" : "Live API"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-line bg-ink-2 lg:flex">
      <Link to="/" className="flex h-14 shrink-0 items-center px-5" aria-label="Pontis home">
        <Wordmark className="h-7" />
      </Link>
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {GROUPS.map((group) => (
          <div key={group.label} className="mt-5 first:mt-0">
            <p className="px-2 pb-1.5 text-[12px] text-faint">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors",
                        isActive
                          ? "bg-panel-3 font-medium text-text"
                          : "text-muted hover:bg-panel-2 hover:text-text",
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0 opacity-80" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <NetworkStatus />
    </aside>
  );
}

/** Global figures. Market totals are synthetic and labelled as such. */
function TopBar() {
  const assets = useAssets();
  const market = useMarketAssets();
  const cap = market.data?.reduce((sum, r) => sum + r.marketCapUsd, 0);
  const vol = market.data?.reduce((sum, r) => sum + r.volume24hUsd, 0);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-8">
        <Link to="/" className="shrink-0 lg:hidden" aria-label="Pontis home">
          <Wordmark className="h-7" />
        </Link>
        <div className="hidden min-w-0 items-center gap-6 overflow-hidden lg:flex">
          {typeof cap === "number" && <Figure label="Synthetic mkt cap">{usdCompact(cap)}</Figure>}
          {typeof vol === "number" && <Figure label="24h volume">{usdCompact(vol)}</Figure>}
          <Figure label="Representations">{assets.data?.length ?? "—"}</Figure>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden whitespace-nowrap text-[12.5px] text-faint xl:inline">
            Testnet · synthetic, unbacked assets · no real value
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

export function Shell() {
  return (
    <div className="min-h-dvh pb-16 lg:pb-0 lg:pl-[232px]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[99] focus:rounded-md focus:bg-gold focus:px-4 focus:py-2 focus:text-gold-ink"
      >
        Skip to content
      </a>

      <Sidebar />
      <TopBar />

      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-7 sm:px-8">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-[1280px] px-4 py-5 text-[12.5px] text-faint sm:px-8">
          Pontis runs on NEAR Testnet with synthetic assets only. Prices, charts and volumes are
          simulated for the demo, nothing is backed or verified, and nothing here is an offer of any
          financial product.
        </p>
      </footer>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {MOBILE.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              cn(
                "flex h-14 flex-col items-center justify-center gap-1 text-[11px]",
                isActive ? "text-text" : "text-faint",
              )
            }
          >
            <item.icon className="size-[18px]" aria-hidden />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <ScrollRestoration />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-6 h-8 w-72 max-w-full" />
      <Skeleton className="h-24" />
      <Skeleton className="mt-4 h-72" />
    </div>
  );
}
