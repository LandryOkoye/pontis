// The pair link: two representations and what, if anything, connects them. Only an approved
// direct equivalent is joined by a solid line carrying its ratio; every other state shows the
// line broken, dashed or absent, with the reason spelled out in words.
import type { CompatibilityClassification } from "@pontis/domain";
import { cn } from "../lib/cn.ts";

type SpanState = CompatibilityClassification | "NONE" | "PENDING";

const META: Record<SpanState, { text: string; color: string; line: string; label: string }> = {
  DIRECT_EQUIVALENT: {
    text: "text-gold",
    color: "border-gold/40",
    line: "border-solid border-gold/60",
    label: "Converts at parity",
  },
  ECONOMICALLY_SIMILAR: {
    text: "text-similar",
    color: "border-similar/40",
    line: "border-dashed border-similar/50",
    label: "Similar, no conversion",
  },
  INCOMPATIBLE: {
    text: "text-danger",
    color: "border-danger/40",
    line: "border-solid border-line-strong",
    label: "No route",
  },
  SUSPENDED: {
    text: "text-warn",
    color: "border-warn/40",
    line: "border-dashed border-warn/50",
    label: "Suspended",
  },
  NONE: {
    text: "text-faint",
    color: "border-line-strong",
    line: "border-dotted border-line-strong",
    label: "No relationship recorded",
  },
  PENDING: {
    text: "text-faint",
    color: "border-line-strong",
    line: "border-dashed border-line-strong",
    label: "Checking",
  },
};

interface Props {
  from: string;
  to: string;
  state: SpanState;
  /** The ratio shown on the link, e.g. "1 : 10". Only drawn when the pair is connected. */
  keystone?: string;
  caption?: string;
  className?: string;
}

function End({ symbol, align }: { symbol: string; align: "left" | "right" }) {
  return (
    <span
      className={cn(
        "num flex h-10 min-w-0 shrink items-center rounded-md border border-line-strong bg-panel-2 px-3 text-[13.5px] font-medium",
        align === "right" && "justify-end",
      )}
    >
      <span className="truncate">{symbol}</span>
    </span>
  );
}

export function Span({ from, to, state, keystone, caption, className }: Props) {
  const meta = META[state];
  const broken = state === "INCOMPATIBLE" || state === "NONE";
  const label = `${from} to ${to}: ${state === "NONE" ? "no relationship" : state.replaceAll("_", " ").toLowerCase()}`;
  const middle = !broken && keystone ? keystone : meta.label;
  return (
    <figure className={cn("w-full", className)}>
      <div role="img" aria-label={label} className="flex items-center">
        <End symbol={from} align="left" />
        <span className={cn("h-0 min-w-4 flex-1 border-t", meta.line)} aria-hidden />
        <span
          className={cn(
            "num shrink-0 whitespace-nowrap rounded-md border bg-panel px-2.5 py-1 text-[12.5px] font-medium",
            meta.color,
            meta.text,
          )}
          aria-hidden
        >
          {middle}
        </span>
        <span className={cn("h-0 min-w-4 flex-1 border-t", meta.line)} aria-hidden />
        <End symbol={to} align="right" />
      </div>
      {!broken && keystone && (
        <p className={cn("mt-2 text-center text-[12.5px]", meta.text)} aria-hidden>
          {meta.label}
        </p>
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-[13px] text-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
