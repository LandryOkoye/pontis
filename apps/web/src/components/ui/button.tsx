import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn.ts";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition duration-200 select-none disabled:opacity-45 disabled:pointer-events-none active:translate-y-px";

const VARIANT: Record<Variant, string> = {
  // Bullion: the one loud element on any screen.
  primary:
    "text-gold-ink bg-[linear-gradient(180deg,#7be495_0%,#5ed472_55%,#3daf67_100%)] shadow-[0_1px_0_rgb(255_255_255/0.45)_inset,0_10px_30px_-12px_rgb(94_212_114/0.6)] hover:brightness-110",
  secondary: "bg-panel-3 text-text border border-line-strong hover:border-gold/50 hover:bg-panel-2",
  outline: "border border-gold/40 text-gold hover:bg-gold/10",
  ghost: "text-muted hover:text-text hover:bg-white/5",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px] rounded-full",
  md: "h-10 px-5 text-sm rounded-full",
  lg: "h-12 px-7 text-[15px] rounded-full",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
    >
      {loading && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(BASE, VARIANT[variant], SIZE[size], className)}>
      {children}
    </Link>
  );
}
