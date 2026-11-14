// One lending action: amount -> unsigned plan from the API -> the wallet signs each call in
// order, waiting for each to be mined before the next. The API never broadcasts anything.
import { AmountError, parseDecimalAmount } from "@pontis/domain";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { evmAdapter, useEvmWallet } from "../evm/wallet.tsx";
import { EvmRejected } from "../evm/types.ts";
import { ApiFailure, api } from "../lib/api.ts";
import { cn } from "../lib/cn.ts";
import { formatUnits } from "../lib/format.ts";
import {
  healthText,
  healthTone,
  lendingKeys,
  OPERATION,
  projectDebt,
  useTokenBalance,
  wadPercent,
} from "../lib/lending.ts";
import type {
  BorrowingCapacity,
  CollateralAsset,
  LendingMarket,
  LendingOperation,
  LendingPlan,
} from "../lib/lending-types.ts";
import { Amount } from "./amount.tsx";
import { ChainAddress, EvmTxHash, EvmWalletControl } from "./lending.tsx";
import { Button } from "./ui/button.tsx";
import { Notice, Panel, Segmented, TONE_TEXT } from "./ui/primitives.tsx";
import { useToast } from "./ui/toast.tsx";

type StepState = "waiting" | "signing" | "confirming" | "confirmed";
interface Step {
  state: StepState;
  hash?: string;
}

const OPERATIONS: LendingOperation[] = ["deposit", "borrow", "repay", "withdraw"];

function parse(text: string, decimals: number): { amount: bigint | null; error: string | null } {
  const trimmed = text.endsWith(".") ? text.slice(0, -1) : text;
  if (trimmed === "") return { amount: null, error: null };
  try {
    const amount = parseDecimalAmount(trimmed, decimals);
    return { amount: amount === 0n ? null : amount, error: null };
  } catch (error) {
    const tooPrecise = error instanceof AmountError && /fractional/.test(error.message);
    return {
      amount: null,
      error: tooPrecise ? `At most ${decimals} decimal places.` : "Enter a valid amount.",
    };
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

const STEP_TEXT: Record<StepState, string> = {
  waiting: "Not sent",
  signing: "Waiting for your wallet…",
  confirming: "Waiting to be mined…",
  confirmed: "Confirmed",
};

function PlanSteps({ plan, steps }: { plan: LendingPlan; steps: Step[] }) {
  return (
    <ol className="space-y-2" aria-label="Calls to sign">
      {plan.transactions.map((tx, i) => {
        const step = steps[i] ?? { state: "waiting" as const };
        return (
          <li key={tx.data} className="rounded-lg border border-line bg-panel-2 p-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium",
                  step.state === "confirmed"
                    ? "border-parity/50 bg-parity/10 text-parity"
                    : "border-line-strong text-faint",
                )}
              >
                {step.state === "confirmed" ? (
                  <Check className="size-3" aria-hidden />
                ) : step.state === "waiting" ? (
                  i + 1
                ) : (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{tx.description}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                  <span className="inline-flex items-center gap-1.5">
                    to <ChainAddress value={tx.to} />
                  </span>
                  <span role="status">{STEP_TEXT[step.state]}</span>
                  {step.hash && <EvmTxHash hash={step.hash} />}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LendingAction({
  market,
  asset,
  loanDecimals,
  capacity,
  eligible,
}: {
  market: LendingMarket;
  asset: CollateralAsset | undefined;
  loanDecimals: number | undefined;
  capacity: BorrowingCapacity | undefined;
  /** Undefined while the eligibility check is still loading. */
  eligible: boolean | undefined;
}) {
  const wallet = useEvmWallet();
  const owner = wallet.account;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<LendingOperation>("deposit");
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<LendingPlan | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const collateralBalance = useTokenBalance(market.collateralToken, owner);
  const loanBalance = useTokenBalance(market.loanToken, owner);

  const usesCollateral = OPERATION[operation].asset === "collateral";
  const symbol = usesCollateral ? (asset?.symbol ?? "collateral") : market.loanSymbol;
  const decimals = usesCollateral ? asset?.decimals : loanDecimals;
  const parsed = decimals === undefined ? { amount: null, error: null } : parse(text, decimals);
  const amount = parsed.amount;

  // The most this action can take, where the app can know it. A withdrawal has no figure here:
  // the API reports collateral as a value, not as a token amount.
  const limit: { label: string; value: bigint } | null =
    operation === "deposit" && collateralBalance.data !== undefined
      ? { label: "Wallet balance", value: collateralBalance.data }
      : operation === "borrow" && capacity
        ? { label: "Available to borrow", value: BigInt(capacity.availableBorrowAmount) }
        : operation === "repay" && capacity && loanBalance.data !== undefined
          ? {
              label: "Repayable now",
              value:
                loanBalance.data < BigInt(capacity.outstandingDebt)
                  ? loanBalance.data
                  : BigInt(capacity.outstandingDebt),
            }
          : null;

  const blocked =
    market.chain !== "ethereum-sepolia"
      ? "This venue is not on Ethereum Sepolia, so the app cannot build its calls yet."
      : decimals === undefined
        ? usesCollateral
          ? "The collateral token is not in the registry, so amounts cannot be entered."
          : "The loan token's decimals could not be read from Sepolia."
        : (operation === "deposit" || operation === "borrow") && eligible === false
          ? "The collateral is not eligible right now, so deposits and borrows are refused. You can still repay and withdraw."
          : null;
  const overLimit = amount !== null && limit !== null && amount > limit.value;
  const problem =
    parsed.error ??
    (overLimit
      ? operation === "deposit"
        ? "More than your wallet balance."
        : operation === "borrow"
          ? "More than you can borrow right now."
          : "More than your debt or your wallet balance."
      : null);

  const preview =
    capacity && amount !== null && (operation === "borrow" || operation === "repay")
      ? projectDebt(capacity, operation === "borrow" ? amount : -amount)
      : null;

  const reset = (clearAmount = true) => {
    setPlan(null);
    setSteps([]);
    setFailure(null);
    if (clearAmount) setText("");
  };

  const review = useMutation({
    mutationFn: () =>
      api.lendingPlan(operation, {
        owner: owner as string,
        marketId: market.id,
        amount: (amount as bigint).toString(),
      }),
    onMutate: () => setFailure(null),
    onSuccess: (result) => {
      setPlan(result);
      setSteps(result.transactions.map(() => ({ state: "waiting" })));
    },
    onError: (error) =>
      setFailure(
        error instanceof ApiFailure && error.code === "NOT_ELIGIBLE"
          ? `The collateral is not eligible: ${error.message}.`
          : error instanceof Error
            ? error.message
            : "The plan could not be built.",
      ),
  });

  const finished = plan !== null && steps.length > 0 && steps.every((s) => s.state === "confirmed");

  /** Sends every call that is not yet confirmed, in order. */
  async function sign() {
    if (!plan || !owner) return;
    setRunning(true);
    setFailure(null);
    const mark = (index: number, step: Step) =>
      setSteps((current) => current.map((s, i) => (i === index ? step : s)));
    let index = steps.findIndex((s) => s.state !== "confirmed");
    try {
      const adapter = await evmAdapter();
      for (; index >= 0 && index < plan.transactions.length; index += 1) {
        const tx = plan.transactions[index];
        if (!tx) break;
        mark(index, { state: "signing" });
        const hash = await adapter.send(owner, tx);
        mark(index, { state: "confirming", hash });
        await adapter.confirm(hash);
        mark(index, { state: "confirmed", hash });
      }
      toast(
        "success",
        OPERATION[operation].done,
        `${formatUnits(amount ?? 0n, decimals ?? 0)} ${symbol}`,
      );
      setText("");
    } catch (error) {
      mark(index, { state: "waiting" });
      if (error instanceof EvmRejected)
        toast("info", "Request declined", "That call was not sent.");
      else setFailure(error instanceof Error ? error.message : "The wallet returned an error.");
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: lendingKeys.all });
    }
  }

  const sentAny = steps.some((s) => s.state === "confirmed");

  return (
    <Panel aria-label="Manage position" className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <Segmented
          label="Action"
          value={operation}
          onChange={(next) => {
            if (running) return;
            setOperation(next);
            reset();
          }}
          options={OPERATIONS.map((value) => ({ value, label: OPERATION[value].label }))}
        />

        <div className="mt-5 rounded-lg border border-line bg-ink-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="lending-amount" className="eyebrow">
              {OPERATION[operation].verb}
            </label>
            {limit && decimals !== undefined && (
              <button
                type="button"
                disabled={!!plan}
                onClick={() => setText(formatUnits(limit.value, decimals).replace(/,/g, ""))}
                className="text-xs text-muted hover:text-text disabled:opacity-50"
              >
                {limit.label}:{" "}
                <span className="num text-text">{formatUnits(limit.value, decimals)}</span> · Max
              </button>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <input
              id="lending-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={text}
              disabled={!!plan || !!blocked}
              aria-invalid={!!problem}
              aria-describedby="lending-amount-help"
              onChange={(event) => {
                const next = event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                setText(next.replace(/^0+(?=\d)/, ""));
                setFailure(null);
              }}
              className="num w-0 min-w-0 flex-1 bg-transparent text-[32px] leading-none text-text outline-none placeholder:text-faint disabled:opacity-60"
            />
            <span className="text-sm text-muted">{symbol}</span>
          </div>
          <p
            id="lending-amount-help"
            className={cn("mt-2 text-xs", problem ? "text-danger" : "text-faint")}
          >
            {problem ??
              (operation === "withdraw"
                ? "The venue refuses a withdrawal that would leave the debt undercollateralised."
                : operation === "repay"
                  ? "Debt accrues interest, so a full repayment can leave a very small remainder."
                  : operation === "borrow"
                    ? "Capped by Pontis' collateral policy, the market's liquidation LTV and its liquidity."
                    : "Collateral must be confirmed on-chain before you can borrow against it.")}
          </p>
        </div>

        {preview && capacity && loanDecimals !== undefined && (
          <dl className="mt-4 divide-y divide-line" aria-label="After this action">
            <Row label="Debt after">
              <Amount value={preview.debt} decimals={loanDecimals} symbol={market.loanSymbol} />
            </Row>
            <Row label="Loan-to-value after">
              <span className="num">
                {wadPercent(preview.ltvWad)}{" "}
                <span className="text-faint">
                  · liquidation at {wadPercent(capacity.liquidationThresholdWad)}
                </span>
              </span>
            </Row>
            <Row label="Health factor after">
              <span className={cn("num", TONE_TEXT[healthTone(preview.healthFactorWad)])}>
                {preview.healthFactorWad === null ? "No debt" : healthText(preview.healthFactorWad)}
              </span>
            </Row>
          </dl>
        )}

        {blocked && owner && (
          <div className="mt-4">
            <Notice title="Not available">{blocked}</Notice>
          </div>
        )}
        {failure && (
          <div className="mt-4" role="alert">
            <Notice tone="danger" title={plan ? "The call did not go through" : "Plan refused"}>
              {failure}
              {sentAny && " Calls already confirmed stay confirmed."}
            </Notice>
          </div>
        )}
      </div>

      {plan && (
        <div className="border-t border-line p-5 sm:p-6">
          <p className="eyebrow mb-3 flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-gold" aria-hidden />
            {finished
              ? "All calls confirmed"
              : `${plan.transactions.length} ${plan.transactions.length === 1 ? "call" : "calls"} to sign, in order`}
          </p>
          <PlanSteps plan={plan} steps={steps} />
        </div>
      )}

      <div className="border-t border-line bg-ink/40 p-5 sm:p-6">
        {!owner ? (
          <div className="flex justify-center">
            <EvmWalletControl />
          </div>
        ) : finished ? (
          <Button size="lg" variant="secondary" className="w-full" onClick={() => reset()}>
            Done
          </Button>
        ) : plan ? (
          <div className="flex gap-3">
            <Button variant="ghost" size="lg" disabled={running} onClick={() => reset(false)}>
              {sentAny ? "Start over" : "Back"}
            </Button>
            <Button size="lg" className="flex-1" loading={running} onClick={() => void sign()}>
              {running ? "Follow your wallet…" : sentAny ? "Continue signing" : "Sign in wallet"}
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full"
            loading={review.isPending}
            disabled={amount === null || !!problem || !!blocked}
            onClick={() => review.mutate()}
          >
            Review {OPERATION[operation].label.toLowerCase()}
          </Button>
        )}
        <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-xs text-faint">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Pontis only assembles the calls. Your wallet signs and sends them.
        </p>
      </div>
    </Panel>
  );
}
