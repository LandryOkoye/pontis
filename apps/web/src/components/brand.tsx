import { useId } from "react";
import { cn } from "../lib/cn.ts";

/** The Pontis mark: the supplied logo file, never redrawn. */
export function Mark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/pontis-mark.png"
      alt=""
      width={319}
      height={299}
      className={cn("size-8 object-contain", className)}
      aria-hidden
    />
  );
}

/** The full Pontis logo (mark + wordmark, light text for dark surfaces). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/pontis-logo.png"
      alt="Pontis"
      width={895}
      height={252}
      className={cn("h-8 w-auto", className)}
    />
  );
}

const METALS = {
  gold: { from: "#b6f5c6", mid: "#3daf67", to: "#0f5233", ink: "#031109" },
  silver: { from: "#f3f5f7", mid: "#b9c1cb", to: "#6c7682", ink: "#14181d" },
} as const;

/** A struck coin for a token, drawn in code. Silver for silver claims, gold otherwise. */
export function TokenMark({
  symbol,
  size = 36,
  className,
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const metal = METALS[/SILV/i.test(symbol) ? "silver" : "gold"];
  const id = useId();
  const suffix = symbol.split("-")[1] ?? symbol.slice(-1);
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={metal.from} />
          <stop offset="0.5" stopColor={metal.mid} />
          <stop offset="1" stopColor={metal.to} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#${id})`} />
      <circle
        cx="20"
        cy="20"
        r="15.5"
        fill="none"
        stroke={metal.ink}
        strokeOpacity="0.35"
        strokeWidth="0.8"
        strokeDasharray="1.2 1.6"
      />
      <circle cx="20" cy="20" r="12.5" fill={metal.ink} fillOpacity="0.12" />
      <text
        x="20"
        y="25.2"
        textAnchor="middle"
        fontFamily="Geist Variable, sans-serif"
        fontSize="16"
        fill={metal.ink}
      >
        {suffix}
      </text>
    </svg>
  );
}
