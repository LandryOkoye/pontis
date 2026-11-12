// Compare two representations: are they the same claim, and why can (or can't) they convert.
import type { Asset } from "@pontis/api-types";
import { ArrowLeftRight, Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AssetPicker } from "../components/asset-picker.tsx";
import { ClassificationBadge, Hallmark, RecordBadge } from "../components/labels.tsx";
import { Span } from "../components/span.tsx";
import { ButtonLink } from "../components/ui/button.tsx";
import {
  Chip,
  ErrorState,
  Facts,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
  TONE_TEXT,
} from "../components/ui/primitives.tsx";
import { cn } from "../lib/cn.ts";
import { CLASSIFICATION, REFUSAL } from "../lib/copy.ts";
import { formatDateTime, ratioText, wholeTokenRate } from "../lib/format.ts";
import { useAsset, useAssets, useCompatibility, useRoute } from "../lib/queries.ts";

interface Line {
  label: string;
  get: (a: Asset) => string;
}

const LINES: Line[] = [
  {
    label: "Canonical claim",
    get: (a) => `${a.canonicalAsset.name} (${a.canonicalAsset.id.toUpperCase()})`,
  },
  { label: "Unit definition", get: (a) => a.canonicalAsset.unitDefinition },
  { label: "Issuer", get: (a) => a.issuer.name },
  { label: "Decimals", get: (a) => String(a.decimals) },
  { label: "Unit multiplier", get: (a) => ratioText(a.unitMultiplier) },
  { label: "Economic rights", get: (a) => a.canonicalAsset.economicRights },
  { label: "Redemption", get: (a) => a.canonicalAsset.redemptionTerms },
  { label: "Custody", get: (a) => a.custodyDescription },
  { label: "Transfer policy", get: (a) => a.transferPolicySummary },
  { label: "Network", get: (a) => a.network },
];

function SideBySide({ a, b }: { a: Asset; b: Asset }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line [&>th]:px-5 [&>th]:py-3 [&>th]:font-normal sm:[&>th]:px-6">
            <th scope="col" className="eyebrow w-[22%]">
              Attribute
            </th>
            {[a, b].map((x) => (
              <th key={x.id} scope="col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{x.symbol}</span>
                  <Hallmark synthetic={x.synthetic} verification={x.verificationStatus} />
                  <RecordBadge status={x.status} />
                </span>
              </th>
            ))}
            <th scope="col" className="eyebrow w-24 text-right">
              Same?
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {LINES.map((line) => {
            const left = line.get(a);
            const right = line.get(b);
            const same = left === right;
            return (
              <tr key={line.label} className="[&>*]:px-5 [&>*]:py-3 sm:[&>*]:px-6">
                <th scope="row" className="align-top text-[13px] font-normal text-muted">
                  {line.label}
                </th>
                <td className="align-top">{left}</td>
                <td className={cn("align-top", !same && "text-gold-pale")}>{right}</td>
                <td className="text-right align-top">
                  {same ? (
                    <span className="inline-flex items-center gap-1 text-xs text-parity">
                      <Check className="size-3.5" aria-hidden /> Same
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-warn">
                      <Minus className="size-3.5" aria-hidden /> Differs
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Compare() {
  const assets = useAssets();
  const [params, setParams] = useSearchParams();
  const list = assets.data ?? [];
  const fromId = params.get("from") ?? list[0]?.id;
  const toId = params.get("to") ?? list.find((x) => x.id !== fromId)?.id;

  const a = useAsset(fromId);
  const b = useAsset(toId);
  const compatibility = useCompatibility(fromId);
  const route = useRoute(fromId, toId);

  const setPair = (nextFrom: string | undefined, nextTo: string | undefined) => {
    const next = new URLSearchParams();
    if (nextFrom) next.set("from", nextFrom);
    if (nextTo) next.set("to", nextTo);
    setParams(next, { replace: true });
  };

  const relation = compatibility.data?.find((r) => r.counterpartId === toId);
  const option = route.data?.routes[0];
  const loading = !a.data || !b.data || compatibility.isLoading || route.isLoading;
  const error = assets.error ?? a.error ?? b.error ?? compatibility.error ?? route.error;

  const state = relation ? relation.classification : "NONE";
  const meta = relation ? CLASSIFICATION[relation.classification] : null;
  const executable = option?.executable === true;

  let verdict: { title: ReactNode; body: string };
  if (executable) {
    verdict = {
      title: (
        <>
          These convert <em className="text-gold-grad">at parity</em>
        </>
      ),
      body: option.explanation,
    };
  } else if (option?.reasonCode) {
    verdict = { title: REFUSAL[option.reasonCode].title, body: option.explanation };
  } else {
    verdict = { title: "Checking the pair…", body: "" };
  }

  return (
    <>
      <PageHeader
        eyebrow="Compatibility"
        title="Compare representations"
        lede="Two tokens are convertible only when an approver has recorded them as direct equivalents. Similar tickers, prices or unit ratios never count."
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-line bg-ink-2 px-5 py-4">
          <AssetPicker
            label="First asset"
            assets={list}
            value={fromId}
            disabledId={toId}
            onChange={(id) => setPair(id, toId)}
          />
          <button
            type="button"
            aria-label="Swap the two assets"
            onClick={() => setPair(toId, fromId)}
            className="grid size-10 place-items-center rounded-full border border-line-strong text-muted transition hover:border-gold hover:text-gold"
          >
            <ArrowLeftRight className="size-4" aria-hidden />
          </button>
          <AssetPicker
            label="Second asset"
            assets={list}
            value={toId}
            disabledId={fromId}
            onChange={(id) => setPair(fromId, id)}
          />
        </div>

        {error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void a.refetch();
              void b.refetch();
              void compatibility.refetch();
              void route.refetch();
            }}
          />
        ) : loading ? (
          <div className="p-6">
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            <Span
              from={a.data.symbol}
              to={b.data.symbol}
              state={state}
              {...(relation?.parityEnabled
                ? {
                    keystone: `1 : ${wholeTokenRate(relation.ratio, a.data.decimals, b.data.decimals)}`,
                  }
                : {})}
            />
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {relation ? (
                  <ClassificationBadge value={relation.classification} />
                ) : (
                  <Chip>No relationship recorded</Chip>
                )}
                {relation && (
                  <Chip tone={relation.status === "approved" ? "parity" : "warn"}>
                    {relation.status}
                  </Chip>
                )}
                {relation && <Chip>v{relation.version}</Chip>}
              </div>
              <h2 className="display text-[34px] sm:text-[42px]">{verdict.title}</h2>
              <p className="mt-3 text-[15px] text-muted">{verdict.body}</p>
              {meta && (
                <p className={cn("mt-3 text-[13px]", TONE_TEXT[meta.tone])}>{meta.meaning}</p>
              )}
              {executable && (
                <ButtonLink to={`/app/convert?from=${a.data.id}&to=${b.data.id}`} className="mt-6">
                  Convert {a.data.symbol} to {b.data.symbol}
                </ButtonLink>
              )}
            </div>
          </div>
        )}
      </Panel>

      {!loading && !error && a.data && b.data && (
        <>
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Panel>
              <PanelHeader eyebrow="The recorded decision" title="Relationship" />
              {relation ? (
                <Facts
                  className="px-5 pb-3 pt-2 sm:px-6"
                  rows={[
                    { label: "Rationale", value: relation.rationale },
                    { label: "Scope", value: relation.scope },
                    {
                      label: "Ratio",
                      value: <span className="num">{ratioText(relation.ratio)}</span>,
                      hint: `Smallest units of ${b.data.symbol} per smallest unit of ${a.data.symbol}. Checked on chain against both unit multipliers.`,
                    },
                    {
                      label: "Proposed by",
                      value: <span className="num text-[13px]">{relation.proposedBy}</span>,
                    },
                    {
                      label: "Approved by",
                      value: relation.approvedBy ? (
                        <span className="num text-[13px]">{relation.approvedBy}</span>
                      ) : (
                        <span className="text-faint">Not approved</span>
                      ),
                    },
                    {
                      label: "Last change",
                      value: (
                        <span className="num text-[13px]">
                          {formatDateTime(relation.updatedAt)}
                        </span>
                      ),
                    },
                  ]}
                />
              ) : (
                <p className="px-5 py-6 text-sm text-muted sm:px-6">
                  Nobody has proposed a compatibility relationship for this pair. Until one is
                  proposed and approved as a direct equivalent, there is no route between them.
                </p>
              )}
            </Panel>

            <Panel aria-label="Review history">
              <PanelHeader eyebrow="Append-only" title="Review history" />
              {relation && relation.history.length > 0 ? (
                <ol className="px-5 py-5 sm:px-6">
                  {[...relation.history].reverse().map((entry, i, all) => (
                    <li
                      key={`${entry.version}-${entry.action}-${entry.at}`}
                      className="relative flex gap-4 pb-6 last:pb-0"
                    >
                      {i < all.length - 1 && (
                        <span
                          className="absolute left-[5px] top-4 h-full w-px bg-line-strong"
                          aria-hidden
                        />
                      )}
                      <span
                        className={cn(
                          "relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-panel",
                          entry.action === "approved" || entry.action === "reapproved"
                            ? "bg-parity"
                            : entry.action === "proposed"
                              ? "bg-ion"
                              : "bg-warn",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-medium capitalize">{entry.action}</span>{" "}
                          <span className="text-faint">· v{entry.version}</span>
                        </p>
                        <p className="mt-0.5 text-[13px] text-muted">{entry.rationale}</p>
                        <p className="num mt-1 text-xs text-faint">
                          {entry.actor} · {formatDateTime(entry.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-5 py-6 text-sm text-muted sm:px-6">No reviews recorded.</p>
              )}
            </Panel>
          </div>

          <Panel className="mt-5 overflow-hidden">
            <PanelHeader
              eyebrow="Side by side"
              title="What each token is a claim on"
              className="pb-4"
            />
            <SideBySide a={a.data} b={b.data} />
          </Panel>
        </>
      )}
    </>
  );
}
