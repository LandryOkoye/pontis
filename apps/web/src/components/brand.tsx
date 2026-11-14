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
  gold: { fill: "#c8a24a", ink: "#1c1503" },
  silver: { fill: "#a9afb8", ink: "#14171b" },
} as const;

/** A flat disc for a token, lettered by its series. Silver for silver claims, gold otherwise. */
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
  const suffix = symbol.split("-")[1] ?? symbol.slice(-1);
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle cx="20" cy="20" r="20" fill={metal.fill} />
      <text
        x="20"
        y="25.6"
        textAnchor="middle"
        fontFamily="Geist Variable, sans-serif"
        fontSize="16"
        fontWeight="600"
        fill={metal.ink}
      >
        {suffix}
      </text>
    </svg>
  );
}
