import type { AssetSummary } from "@pontis/api-types";
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/cn.ts";
import { TokenMark } from "./brand.tsx";
import { Hallmark } from "./labels.tsx";
import { Dialog } from "./ui/dialog.tsx";

interface Props {
  label: string;
  assets: readonly AssetSummary[];
  value: string | undefined;
  onChange: (id: string) => void;
  /** Shown as unavailable (e.g. the asset already chosen on the other side). */
  disabledId?: string | undefined;
  className?: string;
}

/** Button that opens a list of registered representations. */
export function AssetPicker({ label, assets, value, onChange, disabledId, className }: Props) {
  const [open, setOpen] = useState(false);
  const selected = assets.find((a) => a.id === value);
  return (
    <>
      <button
        type="button"
        aria-label={`${label}: ${selected?.symbol ?? "choose an asset"}`}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-line-strong bg-panel-3 pl-1.5 pr-3 transition hover:border-gold/60",
          className,
        )}
      >
        {selected ? (
          <TokenMark symbol={selected.symbol} size={36} />
        ) : (
          <span className="size-9 rounded-full border border-dashed border-line-strong" />
        )}
        <span className="text-[15px] font-medium">{selected?.symbol ?? "Select"}</span>
        <ChevronDown className="size-4 text-faint" aria-hidden />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Registered representations on NEAR Testnet."
      >
        <ul className="-mx-2 max-h-[60vh] space-y-1 overflow-y-auto">
          {assets.map((asset) => {
            const disabled = asset.id === disabledId;
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(asset.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-white/5 disabled:opacity-40"
                >
                  <TokenMark symbol={asset.symbol} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{asset.symbol}</span>
                      <Hallmark
                        synthetic={asset.synthetic}
                        verification={asset.verificationStatus}
                      />
                    </span>
                    <span className="block truncate text-[13px] text-muted">
                      {asset.canonicalAssetName} · {asset.issuer.name}
                    </span>
                  </span>
                  {asset.id === value && <Check className="size-4 text-gold" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}
