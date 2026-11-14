// Issuers: the list, and one issuer's record with its evidence and representations.
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { TokenMark } from "../components/brand.tsx";
import { EvidenceTiers } from "../components/evidence.tsx";
import { Hallmark, RecordBadge } from "../components/labels.tsx";
import {
  Account,
  Chip,
  EmptyState,
  ErrorState,
  Facts,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { formatDate } from "../lib/format.ts";
import { useAssets, useIssuer, useIssuers } from "../lib/queries.ts";

function Monogram({ name }: { name: string }) {
  const letter = name.trim().split(" ").pop()?.[0] ?? "?";
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-line-strong bg-panel-2 text-lg font-semibold text-text">
      {letter}
    </span>
  );
}

export function Issuers() {
  const issuers = useIssuers();
  const assets = useAssets();
  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Issuers"
        lede="The parties that issued each representation. In this MVP every issuer is a fictional test entity run by the project."
      />
      {issuers.isError ? (
        <Panel>
          <ErrorState error={issuers.error} onRetry={() => void issuers.refetch()} />
        </Panel>
      ) : issuers.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : issuers.data?.length === 0 ? (
        <Panel>
          <EmptyState title="No issuers registered" />
        </Panel>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {issuers.data?.map((issuer) => {
            const issued = assets.data?.filter((a) => a.issuer.id === issuer.id) ?? [];
            return (
              <li key={issuer.id}>
                <Link
                  to={`/app/issuers/${issuer.id}`}
                  className="panel group flex h-full flex-col p-5 transition hover:border-faint sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Monogram name={issuer.name} />
                    <RecordBadge status={issuer.status} />
                  </div>
                  <h2 className="mt-5 text-lg font-medium group-hover:text-text">{issuer.name}</h2>
                  <p className="num text-xs text-faint">{issuer.id}</p>
                  <div className="mt-3">
                    <Hallmark
                      synthetic={issuer.synthetic}
                      verification={issuer.verificationStatus}
                    />
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                    <span className="flex items-center gap-2">
                      <span className="flex -space-x-2">
                        {issued.map((a) => (
                          <TokenMark key={a.id} symbol={a.symbol} size={26} />
                        ))}
                      </span>
                      <span className="text-[13px] text-muted">
                        {issued.length} representation{issued.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-4 text-faint transition group-hover:translate-x-1 group-hover:text-text"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function IssuerDetail() {
  const { id } = useParams();
  const issuer = useIssuer(id);
  const assets = useAssets();

  if (issuer.isError)
    return (
      <Panel>
        <ErrorState
          error={issuer.error}
          title="This issuer could not be loaded"
          onRetry={() => void issuer.refetch()}
        />
      </Panel>
    );
  if (!issuer.data)
    return (
      <div aria-busy="true">
        <Skeleton className="mb-6 h-24" />
        <Skeleton className="h-72" />
      </div>
    );

  const i = issuer.data;
  const issued = assets.data?.filter((a) => a.issuer.id === i.id) ?? [];
  const none = <span className="text-faint">Not stated</span>;

  return (
    <>
      <Link
        to="/app/issuers"
        className="mb-6 inline-flex items-center gap-2 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Issuers
      </Link>
      <header className="mb-6 flex items-center gap-4">
        <Monogram name={i.name} />
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Hallmark synthetic={i.synthetic} verification={i.verificationStatus} size="lg" />
            <RecordBadge status={i.status} />
          </div>
          <h1 className="display text-[24px] sm:text-[26px]">{i.name}</h1>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel>
          <PanelHeader eyebrow="Issuer record" title="As registered" />
          <Facts
            className="px-5 pb-3 pt-2 sm:px-6"
            rows={[
              { label: "Identifier", value: <span className="num text-[13px]">{i.id}</span> },
              { label: "Jurisdiction", value: i.jurisdiction ?? none },
              {
                label: "Authorized categories",
                value: (
                  <span className="flex flex-wrap gap-1.5">
                    {i.authorizedCategories.map((c) => (
                      <Chip key={c}>{c}</Chip>
                    ))}
                  </span>
                ),
              },
              {
                label: "Controlled accounts",
                value: (
                  <span className="flex flex-col gap-1">
                    {i.controlledAccounts.map((account) => (
                      <Account key={account} id={account} max={40} />
                    ))}
                  </span>
                ),
              },
              { label: "Contact", value: i.contact ?? none },
              {
                label: "Last reviewed",
                value: i.lastReviewedAt ? formatDate(i.lastReviewedAt) : "Never",
                hint: "Self-reviewed by the project. No third party was involved.",
              },
            ]}
          />
        </Panel>
        <Panel>
          <PanelHeader eyebrow="Issued by this issuer" title="Representations" />
          {issued.length === 0 ? (
            <EmptyState title="No representations" />
          ) : (
            <ul className="divide-y divide-line px-5 pb-1 pt-2 sm:px-6">
              {issued.map((a) => (
                <li key={a.id}>
                  <Link to={`/app/assets/${a.id}`} className="group flex items-center gap-3 py-3.5">
                    <TokenMark symbol={a.symbol} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium group-hover:text-text">{a.symbol}</span>
                      <span className="block truncate text-[13px] text-muted">
                        {a.canonicalAssetName}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-faint group-hover:text-text" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-5">
        <PanelHeader eyebrow="Evidence for this issuer" title="Who says so" />
        <div className="p-5 sm:p-6">
          <EvidenceTiers evidence={i.evidence} />
        </div>
      </Panel>
    </>
  );
}
