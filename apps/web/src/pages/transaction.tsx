// One conversion: its state, the timeline that led there, the receipt and the indexed events.
import type { Transaction } from "@pontis/api-types";
import type { QuoteState } from "@pontis/domain";
import { isTerminalQuoteState } from "@pontis/domain";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock, Loader2, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { TokenMark } from "../components/brand.tsx";
import { StateBadge } from "../components/labels.tsx";
import { ButtonLink } from "../components/ui/button.tsx";
import {
  Account,
  CopyButton,
  ErrorState,
  Facts,
  Notice,
  Panel,
  PanelHeader,
  Skeleton,
  TxHash,
} from "../components/ui/primitives.tsx";
import { cn } from "../lib/cn.ts";
import type { Tone } from "../lib/copy.ts";
import { STATE } from "../lib/copy.ts";
import { bpsText, formatDateTime, groupDigits, shortId, wholeTokenRate } from "../lib/format.ts";
import { useAssets, useTransaction } from "../lib/queries.ts";

type StepStatus = "done" | "current" | "pending" | "error" | "warn" | "muted";
interface Step {
  title: string;
  body: string;
  at: string | null;
  status: StepStatus;
}

const FINAL: Partial<Record<QuoteState, { title: string; status: StepStatus }>> = {
  SETTLED: { title: "Settled", status: "done" },
  FAILED: { title: "Failed and refunded", status: "error" },
  EXPIRED: { title: "Expired", status: "muted" },
  REJECTED: { title: "Rejected", status: "error" },
  CANCELLED: { title: "Cancelled", status: "muted" },
  REQUIRES_RECONCILIATION: { title: "Needs reconciliation", status: "warn" },
};

export function buildTimeline(tx: Transaction): Step[] {
  const submitted = tx.submittedAt !== null;
  const final = FINAL[tx.state];
  const steps: Step[] = [
    {
      title: "Quote signed",
      body: "The quote signer bound the amounts, your account and a 60 second expiry.",
      at: tx.quote.createdAt,
      status: "done",
    },
    {
      title: "Quote accepted",
      body: "The API returned the unsigned actions for your wallet.",
      at: tx.createdAt,
      status: "done",
    },
    {
      title: "Transaction submitted",
      body: submitted
        ? "Your wallet signed and sent ft_transfer_call to the source token."
        : "Waiting for your wallet to sign and send.",
      at: tx.submittedAt,
      status: submitted ? "done" : tx.state === "ACCEPTED" ? "current" : "muted",
    },
  ];
  steps.push(
    final
      ? {
          title: final.title,
          body: tx.failureReason ?? STATE[tx.state].meaning,
          at: tx.settledAt ?? tx.events[0]?.blockTimestamp ?? null,
          status: final.status,
        }
      : {
          title: "Awaiting settlement",
          body: "Waiting for the indexer to see conversion_completed from pontis-core.",
          at: null,
          status: submitted ? "current" : "pending",
        },
  );
  return steps;
}

const DOT: Record<StepStatus, string> = {
  done: "border-parity/60 bg-parity/15 text-parity",
  current: "border-gold/50 bg-gold/[0.08] text-gold",
  pending: "border-line-strong text-faint",
  muted: "border-line-strong text-faint",
  error: "border-danger/60 bg-danger/15 text-danger",
  warn: "border-warn/60 bg-warn/15 text-warn",
};

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <Check className="size-3.5" aria-hidden />;
  if (status === "current") return <Loader2 className="size-3.5 animate-spin" aria-hidden />;
  if (status === "error") return <X className="size-3.5" aria-hidden />;
  if (status === "warn") return <AlertTriangle className="size-3.5" aria-hidden />;
  return <Clock className="size-3.5" aria-hidden />;
}

const BANNER: Partial<Record<QuoteState, { tone: Tone; title: string }>> = {
  FAILED: { tone: "danger", title: "This conversion failed. Your input was refunded in full." },
  EXPIRED: { tone: "neutral", title: "This quote expired before it was used. No tokens moved." },
  REQUIRES_RECONCILIATION: {
    tone: "warn",
    title: "This conversion is waiting for an operator to reconcile it.",
  },
  REJECTED: { tone: "danger", title: "This request was rejected. No tokens moved." },
};

export function TransactionPage() {
  const { id } = useParams();
  const tx = useTransaction(id);
  const assets = useAssets();

  if (tx.isError) {
    return (
      <Panel>
        <ErrorState
          error={tx.error}
          title="This conversion could not be loaded"
          onRetry={() => void tx.refetch()}
        />
      </Panel>
    );
  }
  if (!tx.data || !assets.data) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-6 h-10 w-72" />
        <Skeleton className="h-40" />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const t = tx.data;
  const q = t.quote;
  const from = assets.data.find((a) => a.id === q.fromId);
  const to = assets.data.find((a) => a.id === q.toId);
  const fromDecimals = from?.decimals ?? 0;
  const toDecimals = to?.decimals ?? 0;
  const banner = BANNER[t.state];
  const live = !isTerminalQuoteState(t.state) && t.state !== "REQUIRES_RECONCILIATION";
  const steps = buildTimeline(t);

  return (
    <>
      <Link
        to="/app/activity"
        className="mb-6 inline-flex items-center gap-2 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Activity
      </Link>

      <Panel variant={t.state === "SETTLED" ? "gold" : undefined} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-medium">Parity conversion</h1>
            <StateBadge state={t.state} />
            {live && <span className="text-xs text-faint">updating live</span>}
          </div>
          <span className="flex items-center gap-1 font-mono text-xs text-faint">
            {shortId(t.id, 8, 4)} <CopyButton value={t.id} label="Copy conversion ID" />
          </span>
        </div>
        <div className="grid items-center gap-6 px-5 py-8 sm:px-7 md:grid-cols-[1fr_auto_1fr]">
          <div>
            <p className="eyebrow mb-2">Sent</p>
            <div className="flex items-center gap-3">
              <TokenMark symbol={from?.symbol ?? q.fromId} size={44} />
              <Amount
                value={q.amountIn}
                decimals={fromDecimals}
                symbol={from?.symbol ?? q.fromId}
                className="text-[28px] sm:text-[34px]"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-faint md:flex-col">
            <ArrowRight className="size-5 rotate-90 md:rotate-0" aria-hidden />
            <span className="num text-xs">
              1 : {from && to ? wholeTokenRate(q.ratio, from.decimals, to.decimals) : "—"}
            </span>
          </div>
          <div className="md:text-right">
            <p className="eyebrow mb-2">
              {t.state === "SETTLED" ? "Received" : "Quoted to receive"}
            </p>
            <div className="flex items-center gap-3 md:justify-end">
              <TokenMark symbol={to?.symbol ?? q.toId} size={44} />
              <Amount
                value={q.amountOut}
                decimals={toDecimals}
                symbol={to?.symbol ?? q.toId}
                className={cn("text-[28px] sm:text-[34px]", t.state !== "SETTLED" && "text-muted")}
              />
            </div>
          </div>
        </div>
        {banner && (
          <div className="px-5 pb-6 sm:px-7">
            <Notice tone={banner.tone} title={banner.title}>
              {t.failureReason}
            </Notice>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader eyebrow="Lifecycle" title="Timeline" />
          <ol className="px-5 py-6 sm:px-6">
            {steps.map((step, i) => (
              <li key={step.title} className="relative flex gap-4 pb-7 last:pb-0">
                {i < steps.length - 1 && (
                  <span
                    className={cn(
                      "absolute left-[13px] top-7 h-[calc(100%-28px)] w-px",
                      step.status === "done" ? "bg-parity/40" : "bg-line-strong",
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "relative grid size-7 shrink-0 place-items-center rounded-full border",
                    DOT[step.status],
                  )}
                >
                  <StepIcon status={step.status} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      (step.status === "pending" || step.status === "muted") && "text-muted",
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">{step.body}</p>
                  {step.at && (
                    <p className="num mt-1 text-xs text-faint">{formatDateTime(step.at)}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader eyebrow="Receipt" title="What was quoted" />
            <Facts
              className="px-5 pb-3 pt-2 sm:px-6"
              rows={[
                { label: "Account", value: <Account id={q.accountId} /> },
                {
                  label: "Transaction",
                  value: t.txHash ? (
                    <TxHash hash={t.txHash} />
                  ) : (
                    <span className="text-faint">Not submitted</span>
                  ),
                },
                {
                  label: "Output at ratio",
                  value: (
                    <Amount
                      value={q.amountOutGross}
                      decimals={toDecimals}
                      symbol={to?.symbol ?? q.toId}
                    />
                  ),
                },
                {
                  label: `Protocol fee (${bpsText(q.feeBps)})`,
                  value: (
                    <Amount value={q.fee} decimals={toDecimals} symbol={to?.symbol ?? q.toId} />
                  ),
                  hint: "Taken from the output token, rounded up.",
                },
                {
                  label: "Net output",
                  value: (
                    <Amount
                      value={q.amountOut}
                      decimals={toDecimals}
                      symbol={to?.symbol ?? q.toId}
                    />
                  ),
                },
                { label: "Route", value: q.route.description },
                {
                  label: "Bound versions",
                  value: (
                    <span className="num text-[13px]">
                      compatibility v{q.compatibilityVersion} · policy v{q.policyVersion}
                    </span>
                  ),
                },
                {
                  label: "Quote expiry",
                  value: <span className="num text-[13px]">{formatDateTime(q.expiresAt)}</span>,
                },
              ]}
            />
          </Panel>

          <Panel>
            <PanelHeader eyebrow="Indexed from pontis-core" title="Contract events" />
            {t.events.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted sm:px-6">
                {live
                  ? "No events yet. They appear here once the indexer has processed the receipt."
                  : "No contract events were recorded for this conversion."}
              </p>
            ) : (
              <ul className="divide-y divide-line px-5 pb-2 pt-2 sm:px-6">
                {t.events.map((event) => (
                  <li key={`${event.receiptId}:${event.logIndex}`} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "num text-sm",
                          event.eventName === "conversion_completed" ? "text-parity" : "text-warn",
                        )}
                      >
                        {event.eventName}
                      </span>
                      <span className="num text-xs text-faint">
                        block {groupDigits(String(event.blockHeight))} · log {event.logIndex}
                      </span>
                    </div>
                    <p className="num mt-1 text-xs text-faint">
                      receipt {shortId(event.receiptId, 10, 6)} ·{" "}
                      {formatDateTime(event.blockTimestamp)}
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-md border border-line bg-ink-2 p-3 font-mono text-xs leading-relaxed text-muted">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {isTerminalQuoteState(t.state) && (
        <div className="mt-8 flex justify-center">
          <ButtonLink to={`/app/convert?from=${q.fromId}&to=${q.toId}`} variant="secondary">
            Convert again
          </ButtonLink>
        </div>
      )}
    </>
  );
}
