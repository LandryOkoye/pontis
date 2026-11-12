import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { shortAccount } from "../lib/format.ts";
import { useAssets } from "../lib/queries.ts";
import { useWallet } from "../wallet/context.tsx";
import { useTokenBalances } from "../wallet/hooks.ts";
import { Amount } from "./amount.tsx";
import { TokenMark } from "./brand.tsx";
import { Button } from "./ui/button.tsx";
import { Skeleton } from "./ui/primitives.tsx";

export function WalletButton({ size = "md" }: { size?: "sm" | "md" }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const assets = useAssets();
  const balances = useTokenBalances(open ? assets.data : undefined);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!wallet.accountId) {
    return (
      <Button
        size={size}
        loading={wallet.connecting}
        disabled={!wallet.ready}
        onClick={() => void wallet.connect()}
      >
        <Wallet className="size-4" aria-hidden />
        Connect wallet
      </Button>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2.5 rounded-[12px] border border-line-strong bg-panel-2 pl-2 pr-3 transition hover:border-gold/50"
      >
        <span className="grid size-6 place-items-center rounded-full bg-[linear-gradient(135deg,#5ed472,#3ddc97)] font-mono text-[10px] font-semibold text-ink">
          {wallet.accountId.slice(0, 1).toUpperCase()}
        </span>
        <span className="num hidden text-[13px] sm:inline">
          {shortAccount(wallet.accountId, 20)}
        </span>
        <ChevronDown className="size-3.5 text-faint" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="panel panel-raised absolute right-0 top-12 z-50 w-72 animate-rise p-2"
        >
          <div className="px-3 pb-2 pt-2">
            <p className="eyebrow">
              Connected · Testnet{wallet.kind === "mock" ? " · simulated" : ""}
            </p>
            <p className="num mt-1 truncate text-sm">{wallet.accountId}</p>
          </div>
          <ul className="border-y border-line py-2">
            {balances.length === 0 && (
              <li className="px-3 py-2">
                <Skeleton className="h-5 w-full" />
              </li>
            )}
            {balances.map((b) => (
              <li key={b.asset.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="flex items-center gap-2 text-[13px]">
                  <TokenMark symbol={b.asset.symbol} size={20} />
                  {b.asset.symbol}
                </span>
                {b.balance === null ? (
                  <Skeleton className="h-4 w-16" />
                ) : (
                  <Amount
                    value={b.balance}
                    decimals={b.asset.decimals}
                    compact
                    className="text-[13px]"
                  />
                )}
              </li>
            ))}
          </ul>
          <Link
            role="menuitem"
            to="/app/wallet"
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-text"
          >
            <Wallet className="size-4" aria-hidden /> Wallet and test tokens
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void wallet.disconnect();
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-text"
          >
            <LogOut className="size-4" aria-hidden /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
