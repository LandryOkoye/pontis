// App shell, in the style of a market terminal: a top bar with the logo, primary navigation and
// the wallet, a strip of global figures (real chain state plus synthetic market totals), and a
// tab bar on mobile.
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
import { Chip, Skeleton } from "./ui/primitives.tsx";
import { WalletButton } from "./wallet-button.tsx";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Item[] = [
  { to: "/app", label: "Markets", icon: LineChart, end: true },
  { to: "/app/assets", label: "Assets", icon: Landmark },
  { to: "/app/issuers", label: "Issuers", icon: Building2 },
  { to: "/app/compare", label: "Compare", icon: GitCompareArrows },
  { to: "/app/convert", label: "Convert", icon: ArrowLeftRight },
  { to: "/app/activity", label: "Activity", icon: Activity },
  { to: "/app/wallet", label: "Wallet", icon: Wallet },
  { to: "/app/reconciliation", label: "Reconciliation", icon: Scale },
];
const MOBILE: Item[] = [NAV[0]!, NAV[1]!, NAV[4]!, NAV[5]!, NAV[6]!];

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-faint">{label}</span>
      <span className="num text-text">{children}</span>
    </span>
  );
}

/** Global figures. Chain state is real; market totals are synthetic and labelled as such. */
function StatsStrip() {
  const health = useHealth();
  const assets = useAssets();
  const market = useMarketAssets();
  const cap = market.data?.reduce((sum, r) => sum + r.marketCapUsd, 0);
  const vol = market.data?.reduce((sum, r) => sum + r.volume24hUsd, 0);
  const ok = health.data?.status === "ok";
  return (
    <div className="border-b border-line bg-ink-2/80">
      <div className="mx-auto flex h-9 max-w-[1480px] items-center gap-6 overflow-x-auto px-4 font-mono text-[11px] sm:px-8">
        <span className="flex items-center gap-2 whitespace-nowrap text-faint">
          <span
            className={cn(
              "size-1.5 rounded-full",
              health.isError ? "bg-danger" : ok ? "animate-pulse-soft bg-parity" : "bg-warn",
            )}
            aria-hidden
          />
          API {health.isError ? "unreachable" : (health.data?.status ?? "…")}
        </span>
        {typeof cap === "number" && <Figure label="Synthetic mkt cap">{usdCompact(cap)}</Figure>}
        {typeof vol === "number" && <Figure label="24h volume">{usdCompact(vol)}</Figure>}
        <Figure label="Representations">{assets.data?.length ?? "—"}</Figure>
        <Figure label="Block">
          {typeof health.data?.chainHeight === "number"
            ? groupDigits(String(health.data.chainHeight))
            : "—"}
        </Figure>
        <Figure label="Indexer lag">
          {typeof health.data?.indexerLagBlocks === "number"
            ? `${health.data.indexerLagBlocks} blocks`
            : "—"}
        </Figure>
        <span className="ml-auto whitespace-nowrap text-warn/80">
          Testnet · synthetic, unbacked assets · no real value
        </span>
      </div>
    </div>
  );
}

export function Shell() {
  return (
    <div className="min-h-dvh pb-16 lg:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[99] focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-gold-ink"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-6 px-4 sm:px-8">
          <Link to="/" className="shrink-0" aria-label="Pontis home">
            <Wordmark className="h-8" />
          </Link>
          <nav aria-label="Primary" className="hidden flex-1 items-center gap-0.5 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    "rounded-full px-3.5 py-2 text-[13.5px] transition",
                    isActive
                      ? "bg-gold/12 text-gold"
                      : "text-muted hover:bg-white/[0.04] hover:text-text",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 xl:flex">
            <Chip tone="warn" dot>
              NEAR Testnet
            </Chip>
            {isMock ? (
              <Chip tone="ion" title="Running on local fixtures with a simulated wallet.">
                Mock data
              </Chip>
            ) : (
              <Chip tone="parity" dot pulse>
                Live API
              </Chip>
            )}
          </div>
          <div className="ml-auto xl:ml-0">
            <WalletButton />
          </div>
        </div>
        <StatsStrip />
      </header>

      <main id="main" className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-6 sm:px-8">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-[1480px] px-4 py-6 text-[12.5px] text-faint sm:px-8">
          Pontis runs on NEAR Testnet with synthetic assets only. Prices, charts and volumes are
          simulated for the demo, nothing is backed or verified, and nothing here is an offer of any
          financial product.
        </p>
      </footer>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {MOBILE.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end ?? false}
            className={({ isActive }) =>
              cn(
                "flex h-14 flex-col items-center justify-center gap-1 text-[10.5px]",
                isActive ? "text-gold" : "text-faint",
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
      <Skeleton className="mb-3 h-3 w-28" />
      <Skeleton className="mb-8 h-12 w-80 max-w-full" />
      <div className="grid gap-5 md:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="mt-5 h-72" />
    </div>
  );
}
