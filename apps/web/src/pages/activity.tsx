// The connected account's conversions, in every state the lifecycle can reach.
import type { Transaction } from "@pontis/api-types";
import type { QuoteState } from "@pontis/domain";
import { ArrowRight, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { TokenMark } from "../components/brand.tsx";
import { StateBadge } from "../components/labels.tsx";
import { Button, ButtonLink } from "../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Segmented,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { formatDateTime, shortId, timeAgo } from "../lib/format.ts";
import { useAssets, useTransactions } from "../lib/queries.ts";
import { useWallet } from "../wallet/context.tsx";

type Filter = "all" | "open" | "settled" | "attention";

const GROUP: Record<Exclude<Filter, "all">, QuoteState[]> = {
  open: ["QUOTED", "ACCEPTED", "SUBMITTED"],
  settled: ["SETTLED"],
  attention: ["FAILED", "EXPIRED", "REJECTED", "CANCELLED", "REQUIRES_RECONCILIATION"],
};

export function matchesFilter(tx: Transaction, filter: Filter): boolean {
  return filter === "all" || GROUP[filter].includes(tx.state);
}

export function Activity() {
  const wallet = useWallet();
  const assets = useAssets();
  const transactions = useTransactions(wallet.accountId);
  const [filter, setFilter] = useState<Filter>("all");

  const all = useMemo(() => transactions.data ?? [], [transactions.data]);
  const shown = all.filter((tx) => matchesFilter(tx, filter));
  const count = (f: Filter) => all.filter((tx) => matchesFilter(tx, f)).length;
  const asset = (id: string) => assets.data?.find((a) => a.id === id);

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Conversions"
        lede="Every quote you accepted, with the state the indexer reconciled from contract events."
        actions={<ButtonLink to="/app/convert">New conversion</ButtonLink>}
      />

      {!wallet.accountId ? (
        <Panel>
          <EmptyState
            icon={<Wallet className="size-5" aria-hidden />}
            title="Connect a wallet to see its conversions"
            body="History is listed per account. Pontis has no public feed of other accounts' activity."
            action={
              <Button
                onClick={() => void wallet.connect()}
                loading={wallet.connecting}
                disabled={!wallet.ready}
              >
                Connect wallet
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-4">
            <Segmented
              label="Filter by state"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: count("all") },
                { value: "open", label: "In progress", count: count("open") },
                { value: "settled", label: "Settled", count: count("settled") },
                { value: "attention", label: "Not completed", count: count("attention") },
              ]}
            />
          </div>
          <Panel className="overflow-hidden">
            {transactions.isError ? (
              <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />
            ) : transactions.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState
                title={all.length === 0 ? "No conversions yet" : "Nothing in this state"}
                body={
                  all.length === 0
                    ? "Accepted quotes appear here, whether they settle, expire or fail."
                    : "Try another filter."
                }
                {...(all.length === 0
                  ? {
                      action: (
                        <ButtonLink to="/app/convert" variant="secondary">
                          Start a conversion
                        </ButtonLink>
                      ),
                    }
                  : {})}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="eyebrow border-b border-line [&>th]:px-5 [&>th]:py-3 [&>th]:font-normal">
                      <th scope="col">Conversion</th>
                      <th scope="col" className="text-right">
                        Sent
                      </th>
                      <th scope="col" className="text-right">
                        Received / quoted
                      </th>
                      <th scope="col">State</th>
                      <th scope="col">When</th>
                      <th scope="col">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map((tx) => {
                      const from = asset(tx.quote.fromId);
                      const to = asset(tx.quote.toId);
                      return (
                        <tr
                          key={tx.id}
                          className="group transition hover:bg-white/[0.025] [&>td]:px-5 [&>td]:py-3.5"
                        >
                          <td>
                            <Link to={`/app/activity/${tx.id}`} className="flex items-center gap-3">
                              <span className="flex -space-x-2">
                                <TokenMark symbol={from?.symbol ?? tx.quote.fromId} size={28} />
                                <TokenMark
                                  symbol={to?.symbol ?? tx.quote.toId}
                                  size={28}
                                  className="ring-2 ring-panel rounded-full"
                                />
                              </span>
                              <span>
                                <span className="block font-medium">
                                  {from?.symbol ?? tx.quote.fromId} → {to?.symbol ?? tx.quote.toId}
                                </span>
                                <span className="num block text-xs text-faint">
                                  {shortId(tx.id, 8, 4)}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="text-right">
                            <Amount
                              value={tx.quote.amountIn}
                              decimals={from?.decimals ?? 0}
                              compact
                            />
                          </td>
                          <td className="text-right">
                            <Amount
                              value={tx.quote.amountOut}
                              decimals={to?.decimals ?? 0}
                              compact
                              className={tx.state === "SETTLED" ? "" : "text-muted"}
                            />
                          </td>
                          <td>
                            <StateBadge state={tx.state} />
                          </td>
                          <td
                            className="whitespace-nowrap text-[13px] text-muted"
                            title={formatDateTime(tx.createdAt)}
                          >
                            {timeAgo(tx.createdAt)}
                          </td>
                          <td className="text-right">
                            <Link
                              to={`/app/activity/${tx.id}`}
                              aria-label={`Open conversion ${shortId(tx.id, 8, 4)}`}
                              className="inline-grid size-8 place-items-center rounded-full text-faint transition group-hover:bg-white/5 group-hover:text-gold"
                            >
                              <ArrowRight className="size-4" aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
