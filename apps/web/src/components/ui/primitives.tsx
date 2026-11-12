// Small shared building blocks. Each is deliberately plain so pages compose rather than restyle.
import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Inbox } from "lucide-react";
import { ApiFailure } from "../../lib/api.ts";
import { cn } from "../../lib/cn.ts";
import type { Tone } from "../../lib/copy.ts";
import { explorer, shortAccount, shortId } from "../../lib/format.ts";
import { Button } from "./button.tsx";

export const TONE_TEXT: Record<Tone, string> = {
  gold: "text-gold",
  parity: "text-parity",
  similar: "text-similar",
  ion: "text-ion",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-muted",
};
const TONE_CHIP: Record<Tone, string> = {
  gold: "border-gold/30 bg-gold/10 text-gold",
  parity: "border-parity/30 bg-parity/10 text-parity",
  similar: "border-similar/30 bg-similar/10 text-similar",
  ion: "border-ion/30 bg-ion/10 text-ion",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-danger/30 bg-danger/10 text-danger",
  neutral: "border-line-strong bg-white/[0.03] text-muted",
};
export const TONE_DOT: Record<Tone, string> = {
  gold: "bg-gold",
  parity: "bg-parity",
  similar: "bg-similar",
  ion: "bg-ion",
  warn: "bg-warn",
  danger: "bg-danger",
  neutral: "bg-faint",
};

export function Chip({
  tone = "neutral",
  dot,
  pulse,
  children,
  className,
  title,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium tracking-wide",
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn("size-1.5 rounded-full", TONE_DOT[tone], pulse && "animate-pulse-soft")}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
  variant,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  variant?: "raised" | "gold" | undefined;
  as?: "section" | "div" | "article" | "aside";
  "aria-label"?: string;
}) {
  return (
    <Tag
      {...rest}
      className={cn(
        "panel",
        variant === "raised" && "panel-raised",
        variant === "gold" && "panel-gold",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-end justify-between gap-4 px-5 pt-5 sm:px-6", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="text-[17px] font-medium tracking-tight">{title}</h2>
      </div>
      {action}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl animate-rise">
        <p className="eyebrow mb-3 flex items-center gap-2">
          <span className="h-px w-6 bg-gold/60" aria-hidden />
          {eyebrow}
        </p>
        <h1 className="display text-[40px] sm:text-[52px]">{title}</h1>
        {lede && <p className="mt-3 text-[15px] text-muted">{lede}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full border border-line-strong bg-panel-2 text-faint">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <p className="text-[15px] font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "This could not be loaded",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const code = error instanceof ApiFailure ? error.code : null;
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full border border-danger/30 bg-danger/10 text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      {code && <p className="num mt-2 text-xs text-faint">{code}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      className="inline-grid size-6 place-items-center rounded-md text-faint transition hover:bg-white/5 hover:text-text"
    >
      {copied ? (
        <Check className="size-3.5 text-parity" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}

/** A NEAR account with copy and explorer affordances. */
export function Account({
  id,
  max = 26,
  link = true,
}: {
  id: string;
  max?: number;
  link?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="num truncate text-[13px] text-text" title={id}>
        {shortAccount(id, max)}
      </span>
      <CopyButton value={id} label="Copy account" />
      {link && (
        <a
          href={explorer.account(id)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${id} in the explorer`}
          className="text-faint hover:text-gold"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}

export function TxHash({ hash }: { hash: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={explorer.tx(hash)}
        target="_blank"
        rel="noreferrer"
        className="num text-[13px] text-gold hover:underline"
        title={hash}
      >
        {shortId(hash, 8, 6)}
      </a>
      <CopyButton value={hash} label="Copy transaction hash" />
    </span>
  );
}

/** Definition rows used across detail pages. */
export function Facts({
  rows,
  className,
}: {
  rows: { label: string; value: ReactNode; hint?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid gap-1 py-3 sm:grid-cols-[minmax(140px,34%)_1fr] sm:gap-6"
        >
          <dt className="text-[13px] text-muted">{row.label}</dt>
          <dd className="min-w-0 text-sm text-text">
            {row.value}
            {row.hint && <p className="mt-1 text-xs text-faint">{row.hint}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-ink-2 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-8 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13px] transition",
              active
                ? "bg-panel-3 text-text shadow-[0_1px_0_rgb(220_255_232/0.08)_inset]"
                : "text-muted hover:text-text",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="num text-[11px] text-faint">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({
  tone = "warn",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex gap-3 rounded-[14px] border px-4 py-3", TONE_CHIP[tone])}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-[13px] text-muted">{children}</div>}
      </div>
    </div>
  );
}
