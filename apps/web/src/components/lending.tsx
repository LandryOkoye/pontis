// Shared pieces of the lending pages: the Sepolia wallet control, EVM addresses and hashes,
// and the collateral eligibility chip.
import { ExternalLink, Wallet } from "lucide-react";
import { useEvmWallet } from "../evm/wallet.tsx";
import { config } from "../lib/config.ts";
import { shortId } from "../lib/format.ts";
import { REASON } from "../lib/lending.ts";
import type { CollateralAsset, Eligibility } from "../lib/lending-types.ts";
import { Button } from "./ui/button.tsx";
import { Chip, CopyButton, Skeleton } from "./ui/primitives.tsx";
import { useToast } from "./ui/toast.tsx";

const isEvmAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

/** A token contract, wallet or NEAR account. EVM addresses link to the Sepolia explorer. */
export function ChainAddress({ value }: { value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="num truncate text-[13px] text-text" title={value}>
        {isEvmAddress(value) ? shortId(value, 6, 4) : value}
      </span>
      <CopyButton value={value} label="Copy address" />
      {isEvmAddress(value) && (
        <a
          href={`${config.evmExplorerUrl}/address/${value}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${value} in the Sepolia explorer`}
          className="text-faint hover:text-text"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}

export function EvmTxHash({ hash }: { hash: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={`${config.evmExplorerUrl}/tx/${hash}`}
        target="_blank"
        rel="noreferrer"
        className="num link text-[13px]"
        title={hash}
      >
        {shortId(hash, 8, 6)}
      </a>
      <CopyButton value={hash} label="Copy transaction hash" />
    </span>
  );
}

/** Connect, or show the connected Sepolia account. Separate from the NEAR wallet in the top bar. */
export function EvmWalletControl() {
  const wallet = useEvmWallet();
  const toast = useToast();
  if (!wallet.ready) return <Skeleton className="h-9 w-44" />;
  if (wallet.account)
    return (
      <div className="flex items-center gap-2">
        <span className="flex h-9 items-center gap-2 rounded-md border border-line-strong bg-panel-2 px-3">
          <span className="size-1.5 rounded-full bg-parity" aria-hidden />
          <span className="text-[12.5px] text-faint">
            Sepolia{wallet.kind === "mock" ? " · simulated" : ""}
          </span>
          <ChainAddress value={wallet.account} />
        </span>
        <Button variant="ghost" size="sm" onClick={() => void wallet.disconnect()}>
          Disconnect
        </Button>
      </div>
    );
  return (
    <Button
      loading={wallet.connecting}
      disabled={!wallet.available}
      title={wallet.available ? undefined : "No EVM wallet was found in this browser."}
      onClick={() =>
        void wallet.connect().catch((error: unknown) => {
          if (error instanceof Error && error.name === "EvmRejected") return;
          toast(
            "error",
            "The wallet did not connect",
            error instanceof Error ? error.message : undefined,
          );
        })
      }
    >
      <Wallet className="size-4" aria-hidden />
      {wallet.available ? "Connect Sepolia wallet" : "No EVM wallet found"}
    </Button>
  );
}

/** Pontis' verdict on a market's collateral. Each refusal reason carries its explanation. */
export function EligibilityChips({
  eligibility,
  failed,
}: {
  eligibility: Eligibility | undefined;
  failed?: boolean;
}) {
  if (failed) return <Chip tone="neutral">Unknown</Chip>;
  if (!eligibility) return <Skeleton className="h-[22px] w-20" />;
  if (eligibility.eligible)
    return (
      <Chip tone="parity" dot>
        Eligible
      </Chip>
    );
  return (
    <span className="flex flex-wrap gap-1.5">
      {eligibility.reasons.map((reason) => (
        <Chip key={reason} tone="warn" title={REASON[reason].meaning}>
          {REASON[reason].label}
        </Chip>
      ))}
    </span>
  );
}

/** Registry facts about a collateral token that decide whether it can be used at all. */
export function RegistryChips({ asset }: { asset: CollateralAsset }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <Chip tone={asset.verified ? "parity" : "warn"}>
        {asset.verified ? "Token verified" : "Token not verified"}
      </Chip>
      <Chip tone={asset.issuer.authorized ? "parity" : "warn"}>
        {asset.issuer.authorized ? "Issuer authorised" : "Issuer not authorised"}
      </Chip>
    </span>
  );
}
