import { cn } from "../lib/cn.ts";
import { formatUnits, formatUnitsCompact } from "../lib/format.ts";

/** A token amount, exact. The whole part is bright; the fraction and symbol recede. */
export function Amount({
  value,
  decimals,
  symbol,
  compact,
  className,
}: {
  value: string | bigint;
  decimals: number;
  symbol?: string;
  compact?: boolean;
  className?: string;
}) {
  const exact = formatUnits(value, decimals);
  const shown = compact ? formatUnitsCompact(value, decimals) : exact;
  const [whole, fraction] = shown.split(".");
  return (
    <span
      className={cn("num whitespace-nowrap", className)}
      title={`${exact}${symbol ? ` ${symbol}` : ""}`}
    >
      {whole}
      {fraction !== undefined && <span className="opacity-60">.{fraction}</span>}
      {symbol && <span className="ml-1.5 text-[0.72em] tracking-wide opacity-60">{symbol}</span>}
    </span>
  );
}
