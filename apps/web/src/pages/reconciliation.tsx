// Operator view: what the reconciler last found. Needs the admin key, which is kept in memory
// for this page only and is never written to storage.
import type { ReconciliationReport } from "@pontis/api-types";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { Meter } from "../components/charts.tsx";
import { Button } from "../components/ui/button.tsx";
import { Chip, EmptyState, PageHeader, Panel, PanelHeader } from "../components/ui/primitives.tsx";
import { ApiFailure, api } from "../lib/api.ts";
import { isMock } from "../lib/config.ts";
import { FINDING } from "../lib/copy.ts";
import { formatDateTime, shortId, timeAgo } from "../lib/format.ts";
import { useAssets } from "../lib/queries.ts";

const STATUS = {
  OK: { tone: "parity", label: "All reconciled" },
  ATTENTION: { tone: "warn", label: "Needs attention" },
  NEVER_RUN: { tone: "neutral", label: "Reconciler has not run" },
} as const;

function Report({
  report,
  onRefresh,
  refreshing,
}: {
  report: ReconciliationReport;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const assets = useAssets();
  const status = STATUS[report.status];
  return (
    <>
      <Panel
        variant={report.status === "OK" ? undefined : "gold"}
        className="mb-5 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
      >
        <div>
          <Chip tone={status.tone} dot>
            {status.label}
          </Chip>
          <p className="mt-3 text-sm text-muted">
            {report.ranAt ? (
              <>
                Last run {timeAgo(report.ranAt)} ·{" "}
                <span className="num">{formatDateTime(report.ranAt)}</span>
              </>
            ) : (
              "No run has finished yet."
            )}
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={refreshing} onClick={onRefresh}>
          <RefreshCw className="size-4" aria-hidden /> Refresh
        </Button>
      </Panel>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader eyebrow="Inventory against token balance" title="Vaults" />
          {report.vaults.length === 0 ? (
            <EmptyState title="No vault readings" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2 pt-2 sm:px-6">
              {report.vaults.map((vault) => {
                const asset = assets.data?.find((a) => a.id === vault.representationId);
                const decimals = asset?.decimals ?? 0;
                const inventory = BigInt(vault.inventory);
                const balance = BigInt(vault.balance);
                const matched = inventory === balance;
                const fraction =
                  inventory === 0n
                    ? balance === 0n
                      ? 1
                      : 0
                    : Number((balance * 1000n) / inventory) / 1000;
                return (
                  <li key={vault.representationId} className="py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="font-medium">{asset?.symbol ?? vault.representationId}</span>
                      <Chip tone={matched ? "parity" : inventory > balance ? "danger" : "warn"} dot>
                        {matched
                          ? "Matches"
                          : inventory > balance
                            ? "Owes more than it holds"
                            : "Untracked balance"}
                      </Chip>
                    </div>
                    <dl className="mb-3 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="eyebrow mb-1">Recorded inventory</dt>
                        <dd>
                          <Amount value={vault.inventory} decimals={decimals} compact />
                        </dd>
                      </div>
                      <div>
                        <dt className="eyebrow mb-1">Token balance held</dt>
                        <dd>
                          <Amount value={vault.balance} decimals={decimals} compact />
                        </dd>
                      </div>
                    </dl>
                    <Meter
                      fraction={fraction}
                      tone={matched ? "parity" : "warn"}
                      label={`${asset?.symbol ?? vault.representationId} balance as a share of inventory`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader eyebrow="From the last run" title={`Findings (${report.findings.length})`} />
          {report.findings.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="size-5 text-parity" aria-hidden />}
              title="No findings"
              body="Expected conversions, contract events and vault balances agree."
            />
          ) : (
            <ul className="divide-y divide-line px-5 pb-2 pt-2 sm:px-6">
              {report.findings.map((finding) => (
                <li key={finding.key} className="py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={finding.severity === "critical" ? "danger" : "warn"} dot>
                      {finding.severity}
                    </Chip>
                    <span className="num text-xs text-faint">{finding.kind}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{FINDING[finding.kind]}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{finding.message}</p>
                  <p className="num mt-1.5 text-xs text-faint">
                    subject {shortId(finding.subject, 10, 6)} · first seen{" "}
                    {timeAgo(finding.firstSeenAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-5 overflow-hidden">
        <PanelHeader
          eyebrow="Waiting for a person"
          title={`Quotes in REQUIRES_RECONCILIATION (${report.requiresReconciliation.length})`}
          className="pb-4"
        />
        {report.requiresReconciliation.length === 0 ? (
          <EmptyState title="Nothing is waiting" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="eyebrow border-y border-line [&>th]:px-5 [&>th]:py-3 [&>th]:font-normal sm:[&>th]:px-6">
                  <th scope="col">Quote</th>
                  <th scope="col">Conversion</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Flagged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.requiresReconciliation.map((row) => (
                  <tr key={row.quoteId} className="[&>td]:px-5 [&>td]:py-3.5 sm:[&>td]:px-6">
                    <td className="num text-[13px]">{shortId(row.quoteId, 8, 4)}</td>
                    <td>
                      {row.conversionId ? (
                        <Link
                          to={`/app/activity/${row.conversionId}`}
                          className="link num text-[13px]"
                        >
                          {shortId(row.conversionId, 8, 4)}
                        </Link>
                      ) : (
                        <span className="text-faint">None</span>
                      )}
                    </td>
                    <td className="text-muted">{row.reason ?? "No reason recorded"}</td>
                    <td
                      className="whitespace-nowrap text-[13px] text-muted"
                      title={formatDateTime(row.flaggedAt)}
                    >
                      {timeAgo(row.flaggedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export function Reconciliation() {
  const [key, setKey] = useState("");
  const load = useMutation({ mutationFn: (adminKey: string) => api.reconciliation(adminKey) });
  const unauthorized = load.error instanceof ApiFailure && load.error.code === "UNAUTHORIZED";

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Reconciliation"
        lede="The reconciler compares expected conversions with contract events and vault inventory with token balances. Mismatches are flagged for a person; nothing is silently corrected."
      />
      {load.data ? (
        <Report report={load.data} refreshing={load.isPending} onRefresh={() => load.mutate(key)} />
      ) : (
        <Panel className="mx-auto max-w-lg p-6 sm:p-8">
          <span className="mb-4 grid size-9 place-items-center rounded-lg border border-line bg-panel-2 text-muted">
            <Lock className="size-5" aria-hidden />
          </span>
          <h2 className="text-[17px] font-semibold">Operator access</h2>
          <p className="mt-2 text-sm text-muted">
            This view calls an admin endpoint. Enter the API's admin key; it stays in this page's
            memory and is cleared when you leave.
          </p>
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (key.trim()) load.mutate(key.trim());
            }}
          >
            <label htmlFor="admin-key" className="eyebrow mb-2 block">
              Admin key
            </label>
            <div className="relative">
              <KeyRound
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <input
                id="admin-key"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                aria-invalid={unauthorized}
                aria-describedby="admin-key-help"
                className="num h-10 w-full rounded-md border border-line-strong bg-ink-2 pl-10 pr-4 text-sm outline-none focus:border-faint"
              />
            </div>
            <p
              id="admin-key-help"
              role={load.error ? "alert" : undefined}
              className={`mt-2 min-h-5 text-[13px] ${load.error ? "text-danger" : "text-faint"}`}
            >
              {load.error
                ? unauthorized
                  ? "That key was not accepted."
                  : load.error.message
                : isMock
                  ? "Mock mode: any key of 16 or more characters is accepted."
                  : "Sent as a Bearer token over your connection to the API."}
            </p>
            <Button
              type="submit"
              size="lg"
              className="mt-3 w-full"
              loading={load.isPending}
              disabled={!key.trim()}
            >
              View report
            </Button>
          </form>
        </Panel>
      )}
    </>
  );
}
