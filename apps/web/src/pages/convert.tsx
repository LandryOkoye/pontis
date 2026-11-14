// Convert: amount -> signed quote (60 s) -> wallet signs the unsigned plan -> status page.
// This is a parity conversion of a synthetic test asset. It is never called anything else.
import type { AssetSummary, Quote } from "@pontis/api-types";
import type { RefusalCode } from "@pontis/domain";
import {
  AmountError,
  applyFloor,
  parseDecimalAmount,
  rationalFromWire,
  REFUSAL_CODES,
} from "@pontis/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  ArrowRight,
  Ban,
  Check,
  CircleAlert,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { AssetPicker } from "../components/asset-picker.tsx";
import { CountdownRing, useCountdown } from "../components/countdown.tsx";
import { Span } from "../components/span.tsx";
import { Button } from "../components/ui/button.tsx";
import {
  Chip,
  ErrorState,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { useToast } from "../components/ui/toast.tsx";
import { ApiFailure, api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { REFUSAL } from "../lib/copy.ts";
import { bpsText, formatUnits, wholeTokenRate } from "../lib/format.ts";
import { useAssets, useRoute } from "../lib/queries.ts";
import { useWallet } from "../wallet/context.tsx";
import { useTokenBalances } from "../wallet/hooks.ts";
import { WalletRedirected, WalletRejected } from "../wallet/types.ts";

type Stage = "edit" | "quoted" | "signing" | "reporting";

const isRefusal = (code: string): code is RefusalCode =>
  (REFUSAL_CODES as readonly string[]).includes(code);

function parseInput(
  text: string,
  decimals: number,
): { amount: bigint | null; error: string | null } {
  const trimmed = text.endsWith(".") ? text.slice(0, -1) : text;
  if (trimmed === "") return { amount: null, error: null };
  try {
    const amount = parseDecimalAmount(trimmed, decimals);
    return amount === 0n ? { amount: null, error: null } : { amount, error: null };
  } catch (error) {
    const tooPrecise = error instanceof AmountError && /fractional/.test(error.message);
    return {
      amount: null,
      error: tooPrecise ? `At most ${decimals} decimal places.` : "Enter a valid amount.",
    };
  }
}

const STEPS = ["Amount", "Signed quote", "Sign in wallet", "Settlement"];

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 overflow-x-auto" aria-label="Conversion progress">
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? "step" : undefined}
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <span
            className={cn(
              "num grid size-5 place-items-center rounded-full border text-[11px] font-medium",
              i < current && "border-parity/50 bg-parity/10 text-parity",
              i === current && "border-gold bg-gold text-gold-ink",
              i > current && "border-line-strong text-faint",
            )}
          >
            {i < current ? <Check className="size-3" aria-hidden /> : i + 1}
          </span>
          <span className={cn("text-[13px]", i === current ? "text-text" : "text-faint")}>
            {step}
          </span>
          {i < STEPS.length - 1 && (
            <span className="mx-1 h-px w-6 bg-line-strong sm:w-10" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={cn("text-right text-sm", strong && "text-base text-text")}>{children}</dd>
    </div>
  );
}

const EVM_QUOTE_RECIPIENT = "0xcd578f02bb4d8b12ebb0874bbfa08783d087f609";

function LiveIntentsQuote() {
  const tokens = useQuery({ queryKey: ["intents", "tokens"], queryFn: api.intentTokens });
  const origin = tokens.data?.simulated
    ? undefined
    : tokens.data?.assets.find(
        (asset) =>
          asset.symbol.toUpperCase() === "USDC" && asset.blockchain.toLowerCase() === "near",
      );
  const destination = tokens.data?.simulated
    ? undefined
    : tokens.data?.assets.find(
        (asset) =>
          asset.symbol.toUpperCase() === "USDC" &&
          (asset.blockchain.toLowerCase() === "arb" ||
            asset.blockchain.toLowerCase().includes("arbitrum")),
      );
  const quote = useQuery({
    queryKey: ["intents", "quote", origin?.assetId, destination?.assetId],
    enabled: !!origin && !!destination,
    queryFn: () =>
      api.intentQuote({
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: origin!.assetId,
        destinationAsset: destination!.assetId,
        amount: (10n ** BigInt(origin!.decimals)).toString(),
        depositType: "ORIGIN_CHAIN",
        recipient: EVM_QUOTE_RECIPIENT,
        recipientType: "DESTINATION_CHAIN",
        refundTo: "wrap.near",
        refundType: "ORIGIN_CHAIN",
        deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
      }),
    retry: false,
  });

  return (
    <Panel aria-label="Live NEAR Intents quote" className="p-5 sm:p-6">
      <p className="eyebrow mb-1.5 text-ion">Live NEAR Intents quote (mainnet, dry run)</p>
      <p className="text-[13px] text-muted">
        No deposit is submitted. Pontis&apos;s synthetic tokens are not routable through Intents.
      </p>
      {tokens.isLoading || (origin && destination && quote.isLoading) ? (
        <Skeleton className="mt-4 h-20" />
      ) : quote.data && origin && destination ? (
        <dl className="mt-4 divide-y divide-line text-sm">
          <Row label="Route">
            <span className="text-[13px]">
              {origin.symbol} on {origin.blockchain} → {destination.symbol} on{" "}
              {destination.blockchain}
            </span>
          </Row>
          <Row label="Amount in">
            <span className="num">
              {formatUnits(quote.data.amountIn, origin.decimals)} {origin.symbol}
            </span>
          </Row>
          <Row label="Estimated out">
            <span className="num">
              {formatUnits(quote.data.amountOut, destination.decimals)} {destination.symbol}
            </span>
          </Row>
          <Row label="Minimum out">
            <span className="num">
              {formatUnits(quote.data.minAmountOut, destination.decimals)} {destination.symbol}
            </span>
          </Row>
          <Row label="Source">
            <span className="num text-[13px]">{quote.data.source}</span>
          </Row>
          <Row label="Simulated">
            <span className="num">{String(quote.data.simulated)}</span>
          </Row>
        </dl>
      ) : (
        <p role="status" className="mt-4 text-[13px] text-muted">
          {tokens.isError || quote.isError
            ? "The live quote is unavailable from this API configuration."
            : tokens.data?.simulated
              ? "Connect this panel to the live API to request a mainnet quote."
              : "The live token list has no USDC route from NEAR to Arbitrum at this time."}
        </p>
      )}
    </Panel>
  );
}

function QuoteTicket({
  quote,
  from,
  to,
  stage,
  onConfirm,
  onRequote,
  requoting,
  notice,
}: {
  quote: Quote;
  from: AssetSummary;
  to: AssetSummary;
  stage: Stage;
  onConfirm: () => void;
  onRequote: () => void;
  requoting: boolean;
  notice: string | null;
}) {
  const msLeft = useCountdown(quote.expiresAt);
  const expired = msLeft === 0;
  const busy = stage === "signing" || stage === "reporting";
  return (
    <Panel aria-label="Signed quote" className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <p className="eyebrow mb-1.5 flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-gold" aria-hidden /> Signed quote
          </p>
          <p className="text-[13px] text-muted">
            {expired
              ? "This quote has expired. No tokens moved."
              : "Bound to your account, these amounts and this expiry."}
          </p>
        </div>
        <CountdownRing msLeft={msLeft} />
      </div>
      <div className="perforation mx-5 sm:mx-6" />
      <div className={cn("p-5 transition sm:p-6", expired && "opacity-45")}>
        <p className="eyebrow">You receive</p>
        <p className="mt-1 text-[34px] leading-tight sm:text-[40px]">
          <Amount value={quote.amountOut} decimals={to.decimals} symbol={to.symbol} />
        </p>
        <dl className="mt-4 divide-y divide-line">
          <Row label="You send">
            <Amount value={quote.amountIn} decimals={from.decimals} symbol={from.symbol} />
          </Row>
          <Row label="Approved ratio">
            <span className="num">
              1 {from.symbol} = {wholeTokenRate(quote.ratio, from.decimals, to.decimals)}{" "}
              {to.symbol}
            </span>
          </Row>
          <Row label="Output at ratio">
            <Amount value={quote.amountOutGross} decimals={to.decimals} symbol={to.symbol} />
          </Row>
          <Row label={`Protocol fee (${bpsText(quote.feeBps)})`}>
            <span className="text-muted">
              − <Amount value={quote.fee} decimals={to.decimals} symbol={to.symbol} />
            </span>
          </Row>
          <Row label="Route">
            <span className="text-[13px]">Controlled test vault · same chain · async</span>
          </Row>
          <Row label="Bound to">
            <span className="num text-[13px] text-muted">
              compatibility v{quote.compatibilityVersion} · policy v{quote.policyVersion}
            </span>
          </Row>
        </dl>
        <ul className="mt-4 space-y-1.5">
          {quote.warnings.map((warning) => (
            <li key={warning.code} className="flex gap-2 text-[13px] text-warn/90">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {warning.message}
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-line bg-ink/40 p-5 sm:p-6">
        {notice && !expired && (
          <p role="status" className="mb-3 text-[13px] text-warn">
            {notice}
          </p>
        )}
        {expired ? (
          <Button size="lg" className="w-full" loading={requoting} onClick={onRequote}>
            <RefreshCw className="size-4" aria-hidden /> Get a new quote
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              onClick={onRequote}
              disabled={busy}
              loading={requoting}
              aria-label="Re-quote"
            >
              <RefreshCw className="size-4" aria-hidden />
            </Button>
            <Button size="lg" className="flex-1" loading={busy} onClick={onConfirm}>
              {stage === "signing"
                ? "Waiting for your wallet…"
                : stage === "reporting"
                  ? "Reporting transaction…"
                  : "Confirm and sign"}
            </Button>
          </div>
        )}
        <p className="mt-3 text-center text-xs text-faint">
          Your wallet signs the transfer. Pontis never holds your keys.
        </p>
      </div>
    </Panel>
  );
}

function RefusalPanel({
  code,
  message,
  from,
  to,
}: {
  code: RefusalCode;
  message: string;
  from: string;
  to: string;
}) {
  const copy = REFUSAL[code];
  return (
    <Panel aria-label="Quote refused" className="border-danger/30 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-danger/20 bg-danger/[0.07] text-danger">
          <Ban className="size-5" aria-hidden />
        </span>
        <div>
          <p className="eyebrow mb-1 !text-danger">No quote · {code}</p>
          <h2 className="text-lg font-medium">{copy.title}</h2>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">{copy.body}</p>
      <p className="mt-2 text-[13px] text-faint">API said: {message}</p>
      <Link
        to={`/app/compare?from=${from}&to=${to}`}
        className="link mt-4 inline-flex items-center gap-1.5 text-sm"
      >
        {copy.action} <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </Panel>
  );
}

export function Convert() {
  const assets = useAssets();
  const wallet = useWallet();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();

  const list = assets.data ?? [];
  const fromId = params.get("from") ?? list[0]?.id;
  const toId = params.get("to") ?? list.find((a) => a.id !== fromId)?.id;
  const from = list.find((a) => a.id === fromId);
  const to = list.find((a) => a.id === toId);

  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("edit");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [refusal, setRefusal] = useState<{ code: RefusalCode; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const idempotencyKey = useRef<string>("");

  const route = useRoute(from?.id, to?.id);
  const option = route.data?.routes[0];
  const balances = useTokenBalances(assets.data);
  const balance = balances.find((b) => b.asset.id === from?.id)?.balance ?? null;

  const parsed = useMemo(() => parseInput(text, from?.decimals ?? 0), [text, from?.decimals]);
  const overBalance = parsed.amount !== null && balance !== null && parsed.amount > BigInt(balance);
  const estimate =
    parsed.amount !== null && option?.ratio
      ? applyFloor(rationalFromWire(option.ratio), parsed.amount)
      : null;

  // Any change to the pair or amount invalidates what was quoted.
  const resetQuote = () => {
    setQuote(null);
    setRefusal(null);
    setNotice(null);
    setStage("edit");
  };
  useEffect(resetQuote, [fromId, toId, wallet.accountId]);

  const setPair = (nextFrom: string | undefined, nextTo: string | undefined) => {
    const next = new URLSearchParams();
    if (nextFrom) next.set("from", nextFrom);
    if (nextTo) next.set("to", nextTo);
    setParams(next, { replace: true });
  };

  const requestQuote = useMutation({
    mutationFn: () =>
      api.createQuote({
        fromId: from!.id,
        toId: to!.id,
        amountIn: parsed.amount!.toString(),
        accountId: wallet.accountId!,
      }),
    onMutate: () => {
      setRefusal(null);
      setNotice(null);
    },
    onSuccess: (created) => {
      idempotencyKey.current = crypto.randomUUID();
      setQuote(created);
      setStage("quoted");
    },
    onError: (error) => {
      setQuote(null);
      setStage("edit");
      if (error instanceof ApiFailure && isRefusal(error.code))
        setRefusal({ code: error.code, message: error.message });
      else
        toast("error", "Could not get a quote", error instanceof Error ? error.message : undefined);
    },
  });

  async function confirm() {
    if (!quote) return;
    setNotice(null);
    setStage("signing");
    let conversionId: string | null = null;
    try {
      const plan = await api.createConversion(quote.id, idempotencyKey.current);
      conversionId = plan.conversionId;
      let txHash: string;
      try {
        ({ txHash } = await wallet.send(plan.actions, { kind: "conversion", conversionId }));
      } catch (error) {
        // A transaction that failed on chain still has a hash worth reporting.
        const failedHash = (error as { txHash?: unknown }).txHash;
        if (typeof failedHash !== "string") throw error;
        txHash = failedHash;
      }
      setStage("reporting");
      await api.markSubmitted(conversionId, txHash);
      void client.invalidateQueries({ queryKey: ["transactions"] });
      void client.invalidateQueries({ queryKey: ["balance"] });
      void navigate(`/app/activity/${conversionId}`);
    } catch (error) {
      if (error instanceof WalletRedirected) return;
      setStage("quoted");
      if (error instanceof WalletRejected) {
        setNotice(
          "You declined the request in your wallet. Nothing was sent; you can sign again while the quote is valid.",
        );
      } else if (error instanceof ApiFailure && error.code === "QUOTE_EXPIRED") {
        setNotice("The quote expired before it could be accepted. Get a new quote.");
      } else if (conversionId) {
        toast(
          "error",
          "The conversion was not confirmed",
          error instanceof Error ? error.message : undefined,
        );
        void navigate(`/app/activity/${conversionId}`);
      } else {
        toast(
          "error",
          "Could not start the conversion",
          error instanceof Error ? error.message : undefined,
        );
      }
    }
  }

  if (assets.isError)
    return (
      <Panel>
        <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
      </Panel>
    );

  const routeBlocked = option && !option.executable;
  const cta = !wallet.accountId
    ? {
        label: "Connect wallet to get a quote",
        action: () => void wallet.connect(),
        disabled: !wallet.ready,
      }
    : parsed.amount === null
      ? { label: "Enter an amount", action: () => {}, disabled: true }
      : overBalance
        ? { label: `Not enough ${from?.symbol ?? ""}`, action: () => {}, disabled: true }
        : {
            label: "Get signed quote",
            action: () => requestQuote.mutate(),
            disabled: !from || !to,
          };

  const step = stage === "edit" ? 0 : stage === "quoted" ? 1 : 2;

  return (
    <>
      <PageHeader
        eyebrow="Parity conversion"
        title={<>Convert at the approved ratio</>}
        lede="Move between two representations of the same claim. The ratio is fixed by an approved compatibility relationship, not by a market."
      />
      <Steps current={step} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <Panel className="p-2">
          {assets.isLoading || !from || !to ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-ink-2 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <label htmlFor="amount-in" className="eyebrow">
                    You send
                  </label>
                  {wallet.accountId && (
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-text disabled:hover:text-muted"
                      disabled={balance === null || balance === "0"}
                      onClick={() => {
                        if (balance !== null)
                          setText(formatUnits(balance, from.decimals).replaceAll(",", ""));
                        resetQuote();
                      }}
                    >
                      Balance {balance === null ? "…" : formatUnits(balance, from.decimals)} ·{" "}
                      <span className="font-medium text-text">Max</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="amount-in"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={text}
                    aria-invalid={!!parsed.error || overBalance}
                    aria-describedby="amount-help"
                    onChange={(event) => {
                      const next = event.target.value
                        .replace(/[^0-9.]/g, "")
                        .replace(/(\..*)\./g, "$1");
                      setText(next.replace(/^0+(?=\d)/, ""));
                      if (quote || refusal) resetQuote();
                    }}
                    className="num w-0 min-w-0 flex-1 bg-transparent text-[40px] leading-none text-text outline-none placeholder:text-faint sm:text-[52px]"
                  />
                  <AssetPicker
                    label="Send"
                    assets={list}
                    value={from.id}
                    disabledId={to.id}
                    onChange={(id) => setPair(id, to.id)}
                  />
                </div>
                <p
                  id="amount-help"
                  className={cn(
                    "mt-2 min-h-5 text-[13px]",
                    parsed.error || overBalance ? "text-danger" : "text-faint",
                  )}
                >
                  {parsed.error ??
                    (overBalance
                      ? `This is more ${from.symbol} than the wallet holds.`
                      : `${from.canonicalAssetName} · ${from.decimals} decimals`)}
                </p>
              </div>

              <div className="relative z-10 -my-4 flex justify-center">
                <button
                  type="button"
                  aria-label="Reverse direction"
                  onClick={() => setPair(to.id, from.id)}
                  className="grid size-8 place-items-center rounded-md border border-line-strong bg-panel-2 text-muted transition hover:border-faint hover:text-text"
                >
                  <ArrowDownUp className="size-4" aria-hidden />
                </button>
              </div>

              <div className="rounded-xl bg-ink-2 p-5">
                <p className="eyebrow mb-3">You receive {quote ? "" : "· before fee"}</p>
                <div className="flex items-center gap-3">
                  <p
                    className={cn(
                      "min-w-0 flex-1 truncate text-[40px] leading-none sm:text-[52px]",
                      quote ? "text-text" : "text-muted",
                    )}
                  >
                    {quote ? (
                      <Amount value={quote.amountOut} decimals={to.decimals} />
                    ) : estimate !== null ? (
                      <Amount value={estimate} decimals={to.decimals} />
                    ) : (
                      <span className="num text-faint">0</span>
                    )}
                  </p>
                  <AssetPicker
                    label="Receive"
                    assets={list}
                    value={to.id}
                    disabledId={from.id}
                    onChange={(id) => setPair(from.id, id)}
                  />
                </div>
                <p className="mt-2 min-h-5 text-[13px] text-faint">
                  {quote
                    ? "Exact, from the signed quote."
                    : estimate !== null
                      ? "Indicative. The signed quote sets the exact output and fee."
                      : `${to.canonicalAssetName} · ${to.decimals} decimals`}
                </p>
              </div>

              <div className="p-3 pt-4">
                {route.isLoading ? (
                  <Skeleton className="h-11" />
                ) : option ? (
                  <div className="flex items-start gap-3 rounded-lg border border-line px-4 py-3">
                    <Chip tone={option.executable ? "parity" : "danger"} dot>
                      {option.executable ? "Route open" : "No route"}
                    </Chip>
                    <p className="flex-1 text-[13px] text-muted">
                      {option.executable && option.ratio ? (
                        <>
                          <span className="num text-text">
                            1 {from.symbol} ={" "}
                            {wholeTokenRate(option.ratio, from.decimals, to.decimals)} {to.symbol}
                          </span>
                          {" · "}approved direct equivalents, compatibility v
                          {option.compatibilityVersion}
                        </>
                      ) : (
                        option.explanation
                      )}
                    </p>
                  </div>
                ) : null}
                {routeBlocked ? (
                  <Link
                    to={`/app/compare?from=${from.id}&to=${to.id}`}
                    className="link mt-4 flex items-center justify-center gap-1.5 text-sm"
                  >
                    See why this pair cannot convert <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : (
                  stage === "edit" && (
                    <Button
                      size="lg"
                      className="mt-4 w-full"
                      disabled={cta.disabled}
                      loading={requestQuote.isPending || wallet.connecting}
                      onClick={cta.action}
                    >
                      {cta.label}
                    </Button>
                  )
                )}
              </div>
            </>
          )}
        </Panel>

        <div className="space-y-5">
          {quote && from && to ? (
            <QuoteTicket
              quote={quote}
              from={from}
              to={to}
              stage={stage}
              notice={notice}
              requoting={requestQuote.isPending}
              onConfirm={() => void confirm()}
              onRequote={() => requestQuote.mutate()}
            />
          ) : refusal && from && to ? (
            <RefusalPanel {...refusal} from={from.id} to={to.id} />
          ) : (
            <Panel className="p-5 sm:p-6">
              <Span
                from={from?.symbol ?? "—"}
                to={to?.symbol ?? "—"}
                state={
                  !option
                    ? "PENDING"
                    : option.executable
                      ? "DIRECT_EQUIVALENT"
                      : option.ratio
                        ? "ECONOMICALLY_SIMILAR"
                        : "NONE"
                }
                {...(option?.executable && option.ratio && from && to
                  ? { keystone: `1 : ${wholeTokenRate(option.ratio, from.decimals, to.decimals)}` }
                  : {})}
              />
              <ol className="mt-6 space-y-4">
                {[
                  {
                    icon: ShieldCheck,
                    title: "Checked twice",
                    body: "Compatibility, allowlist and vault inventory are checked when you quote and again on chain when you execute.",
                  },
                  {
                    icon: Timer,
                    title: "Quotes last 60 seconds",
                    body: "Each quote is signed by the quote signer and bound to your account, the amounts and the expiry.",
                  },
                  {
                    icon: RefreshCw,
                    title: "Fails safe",
                    body: "If anything does not match on chain, the contract refunds your input in full.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <item.icon className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-[13px] text-muted">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {wallet.accountId && balance === "0" && from && (
            <Notice tone="ion" title={`This wallet holds no ${from.symbol}`}>
              <Link to="/app/wallet" className="link">
                Get test tokens from the faucet
              </Link>
            </Notice>
          )}
          <LiveIntentsQuote />
        </div>
      </div>
    </>
  );
}
