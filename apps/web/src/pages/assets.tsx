// Registry: every registered token representation, with its claim, issuer, unit and labels.
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Amount } from "../components/amount.tsx";
import { TokenMark } from "../components/brand.tsx";
import { Hallmark, RecordBadge } from "../components/labels.tsx";
import { ButtonLink } from "../components/ui/button.tsx";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Segmented,
  Skeleton,
} from "../components/ui/primitives.tsx";
import { ratioText } from "../lib/format.ts";
import { useAssetDetails, useAssets } from "../lib/queries.ts";

export function Assets() {
  const assets = useAssets();
  const [claim, setClaim] = useState("all");
  const [query, setQuery] = useState("");
  const list = useMemo(() => assets.data ?? [], [assets.data]);
  const details = useAssetDetails(list.map((a) => a.id));

  const claims = useMemo(() => {
    const seen = new Map<string, { name: string; count: number }>();
    for (const a of list) {
      const entry = seen.get(a.canonicalAssetId) ?? {
        name: a.canonicalAssetId.toUpperCase(),
        count: 0,
      };
      entry.count += 1;
      seen.set(a.canonicalAssetId, entry);
    }
    return [...seen.entries()];
  }, [list]);

  const needle = query.trim().toLowerCase();
  const shown = list.filter(
    (a) =>
      (claim === "all" || a.canonicalAssetId === claim) &&
      (needle === "" ||
        [a.symbol, a.name, a.issuer.name, a.canonicalAssetName, a.accountId].some((v) =>
          v.toLowerCase().includes(needle),
        )),
  );

  return (
    <>
      <PageHeader
        eyebrow="Registry"
        title="Asset representations"
        lede="A representation is one token contract. Several can stand for the same canonical claim, each with its own issuer, decimals and unit multiplier."
        actions={
          <ButtonLink to="/app/compare" variant="secondary">
            Compare two
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Filter by canonical claim"
          value={claim}
          onChange={setClaim}
          options={[
            { value: "all", label: "All claims", count: list.length },
            ...claims.map(([id, c]) => ({ value: id, label: c.name, count: c.count })),
          ]}
        />
        <label className="relative block sm:w-64">
          <span className="sr-only">Search assets</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Symbol, issuer, account…"
            className="h-10 w-full rounded-full border border-line bg-ink-2 pl-9 pr-4 text-sm outline-none placeholder:text-faint focus:border-gold/60"
          />
        </label>
      </div>

      <Panel className="overflow-hidden">
        {assets.isError ? (
          <ErrorState error={assets.error} onRetry={() => void assets.refetch()} />
        ) : assets.isLoading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            title={list.length === 0 ? "No representations registered" : "No assets match"}
            body={
              list.length === 0
                ? "The registry sync has not mirrored any representation from pontis-core yet."
                : "Clear the search or pick another claim."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="eyebrow border-b border-line [&>th]:px-5 [&>th]:py-3 [&>th]:font-normal">
                  <th scope="col" className="w-10">
                    #
                  </th>
                  <th scope="col">Representation</th>
                  <th scope="col">Canonical claim</th>
                  <th scope="col">Issuer</th>
                  <th scope="col" className="text-right">
                    Unit multiplier
                  </th>
                  <th scope="col" className="text-right">
                    Test vault
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((asset) => {
                  const detail = details[list.findIndex((a) => a.id === asset.id)]?.data;
                  return (
                    <tr
                      key={asset.id}
                      className="group transition hover:bg-white/[0.025] [&>td]:px-5 [&>td]:py-4"
                    >
                      <td className="num text-faint">{list.indexOf(asset) + 1}</td>
                      <td>
                        <Link to={`/app/assets/${asset.id}`} className="flex items-center gap-3">
                          <TokenMark symbol={asset.symbol} size={38} />
                          <span>
                            <span className="flex items-center gap-2">
                              <span className="font-medium group-hover:text-gold">
                                {asset.symbol}
                              </span>
                              <Hallmark
                                synthetic={asset.synthetic}
                                verification={asset.verificationStatus}
                              />
                            </span>
                            <span className="num block text-xs text-faint">{asset.accountId}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="block">{asset.canonicalAssetName}</span>
                        <span className="num text-xs text-faint">
                          {asset.canonicalAssetId.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <Link to={`/app/issuers/${asset.issuer.id}`} className="hover:text-gold">
                          {asset.issuer.name}
                        </Link>
                      </td>
                      <td className="text-right">
                        <span className="num">{ratioText(asset.unitMultiplier)}</span>
                        <span className="block text-xs text-faint">{asset.decimals} decimals</span>
                      </td>
                      <td className="text-right">
                        {detail ? (
                          <Amount value={detail.vaultInventory} decimals={asset.decimals} compact />
                        ) : (
                          <Skeleton className="ml-auto h-4 w-20" />
                        )}
                      </td>
                      <td>
                        <RecordBadge status={asset.status} />
                      </td>
                      <td className="text-right">
                        <Link
                          to={`/app/assets/${asset.id}`}
                          aria-label={`Open ${asset.symbol}`}
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
      <p className="mt-4 text-[13px] text-faint">
        Unit multiplier = canonical units per smallest token unit. Pontis never infers equivalence
        from a ticker, a price or a matching multiplier.
      </p>
    </>
  );
}
