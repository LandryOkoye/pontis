// Wallet: balances read from the token contracts, and the testnet faucet.
import type { AssetSummary } from "@pontis/api-types";
import { parseDecimalAmount } from "@pontis/domain";
import { Droplets, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { TokenMark } from "../components/brand.tsx";
import { Hallmark } from "../components/labels.tsx";
import { Button, ButtonLink } from "../components/ui/button.tsx";
import {
  Account,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { useToast } from "../components/ui/toast.tsx";
import { canonicalUnits, formatUnits } from "../lib/format.ts";
import { useAssets } from "../lib/queries.ts";
import { useWallet } from "../wallet/context.tsx";
import type { TokenBalance } from "../wallet/hooks.ts";
import { useFaucetMint, useFaucetState, useTokenBalances } from "../wallet/hooks.ts";
import { WalletRedirected, WalletRejected } from "../wallet/types.ts";

/** Whole tokens handed out per faucet call, capped by the contract's `max_per_call`. */
const FAUCET_TOKENS = "10";

function FaucetCard({ row }: { row: TokenBalance }) {
  const asset: AssetSummary = row.asset;
  const faucet = useFaucetState(asset);
  const mint = useFaucetMint(asset);
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const state = faucet.data;
  const waitSeconds = state ? Math.max(0, Math.ceil((state.nextAvailableMs - now) / 1000)) : 0;
  const wanted = parseDecimalAmount(FAUCET_TOKENS, asset.decimals);
  const amount =
    state && wanted > BigInt(state.config.max_per_call)
      ? BigInt(state.config.max_per_call)
      : wanted;

  const request = () =>
    mint.mutate(
      { amount: amount.toString(), registered: state?.registered ?? false },
      {
        onSuccess: () =>
          toast(
            "success",
            `${formatUnits(amount, asset.decimals)} ${asset.symbol} minted`,
            "Test tokens only. They have no value.",
          ),
        onError: (error) => {
          if (error instanceof WalletRedirected) return;
          if (error instanceof WalletRejected)
            toast("info", "Request declined", "Nothing was sent.");
          else toast("error", "The faucet refused", error.message);
        },
      },
    );

  return (
    <Panel as="article" className="flex flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <TokenMark symbol={asset.symbol} size={44} />
          <div>
            <Link to={`/app/assets/${asset.id}`} className="font-medium hover:text-gold">
              {asset.symbol}
            </Link>
            <p className="text-[13px] text-muted">{asset.issuer.name}</p>
          </div>
        </div>
        <Hallmark synthetic={asset.synthetic} verification={asset.verificationStatus} />
      </div>
      <div className="mt-6">
        <p className="eyebrow mb-1">Balance</p>
        {row.error ? (
          <p className="text-sm text-danger">Could not read the balance from the token contract.</p>
        ) : row.balance === null ? (
          <Skeleton className="h-10 w-40" />
        ) : (
          <>
            <Amount
              value={row.balance}
              decimals={asset.decimals}
              className="text-[34px] leading-tight"
            />
            <p className="num mt-1 text-xs text-faint">
              = {canonicalUnits(row.balance, asset.unitMultiplier)} canonical units of{" "}
              {asset.canonicalAssetId.toUpperCase()}
            </p>
          </>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[13px] text-muted">
          {faucet.isError ? (
            "Faucet state unavailable."
          ) : !state ? (
            "Checking the faucet…"
          ) : !state.config.enabled ? (
            "The faucet is disabled for this token."
          ) : waitSeconds > 0 ? (
            <>
              Cooldown: <span className="num text-text">{waitSeconds}s</span>
            </>
          ) : (
            `Up to ${formatUnits(state.config.max_per_call, asset.decimals)} per call${state.registered ? "" : " · registers your account first"}`
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          loading={mint.isPending}
          disabled={!state || !state.config.enabled || waitSeconds > 0}
          onClick={request}
        >
          <Droplets className="size-4" aria-hidden /> Get {formatUnits(amount, asset.decimals)}{" "}
          {asset.symbol}
        </Button>
      </div>
    </Panel>
  );
}

export function WalletPage() {
  const wallet = useWallet();
  const assets = useAssets();
  const balances = useTokenBalances(assets.data);

  return (
    <>
      <PageHeader
        eyebrow="Wallet"
        title="Balances and test tokens"
        lede="Balances are read straight from each token contract. The faucet mints synthetic test tokens so you can try a conversion."
        actions={wallet.accountId ? <ButtonLink to="/app/convert">Convert</ButtonLink> : undefined}
      />
      {!wallet.accountId ? (
        <Panel>
          <EmptyState
            icon={<Wallet className="size-5" aria-hidden />}
            title="No wallet connected"
            body="Connect a NEAR Testnet account. Pontis never asks for or stores a private key."
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
        </Panel>
      ) : assets.isError ? (
        <Panel>
          <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
        </Panel>
      ) : (
        <>
          <Panel className="mb-5">
            <PanelHeader
              eyebrow={`Connected · NEAR Testnet${wallet.kind === "mock" ? " · simulated wallet" : ""}`}
              title={<Account id={wallet.accountId} max={40} link={wallet.kind === "near"} />}
              action={
                <Button variant="ghost" size="sm" onClick={() => void wallet.disconnect()}>
                  Disconnect
                </Button>
              }
              className="pb-5"
            />
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            {assets.isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-64" />)}
            {balances.map((row) => (
              <FaucetCard key={row.asset.id} row={row} />
            ))}
          </div>
          <p className="mt-6 text-[13px] text-faint">
            Conversions also need this account to be on the testnet allowlist. That is a demo
            control managed by the operator, not a regulatory eligibility check.
          </p>
        </>
      )}
    </>
  );
}
