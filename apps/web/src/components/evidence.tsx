// Evidence, always split by who produced it. An empty tier is shown as empty, never hidden:
// the absence of third-party or independent evidence is itself information (ADR 0009).
import type { Evidence } from "@pontis/api-types";
import type { EvidenceProvenance } from "@pontis/domain";
import { EVIDENCE_PROVENANCES } from "@pontis/domain";
import { FileText } from "lucide-react";
import { cn } from "../lib/cn.ts";
import { PROVENANCE } from "../lib/copy.ts";
import { formatDate, shortId } from "../lib/format.ts";
import { CopyButton, TONE_TEXT } from "./ui/primitives.tsx";

export function EvidenceTiers({ evidence }: { evidence: readonly Evidence[] }) {
  const byTier = (tier: EvidenceProvenance) => evidence.filter((e) => e.provenance === tier);
  return (
    <div className="grid gap-px overflow-hidden rounded-[14px] border border-line bg-line md:grid-cols-3">
      {EVIDENCE_PROVENANCES.map((tier) => {
        const meta = PROVENANCE[tier];
        const items = byTier(tier);
        return (
          <section key={tier} aria-label={meta.label} className="bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className={cn("text-[13px] font-medium", TONE_TEXT[meta.tone])}>{meta.label}</h3>
              <span className="num text-xs text-faint">{items.length}</span>
            </div>
            <p className="mt-1 text-xs text-faint">{meta.meaning}</p>
            {items.length === 0 ? (
              <p className="mt-4 rounded-[10px] border border-dashed border-line-strong px-3 py-4 text-center text-xs text-faint">
                None on record
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-[10px] border border-line bg-ink-2 p-3">
                    <p className="flex items-start gap-2 text-[13px]">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
                      <span className="min-w-0 break-words">{item.description}</span>
                    </p>
                    <dl className="mt-2.5 space-y-1 font-mono text-[11px] text-faint">
                      <div className="flex gap-2">
                        <dt>uri</dt>
                        <dd className="min-w-0 truncate text-muted" title={item.uri}>
                          {item.uri}
                        </dd>
                      </div>
                      <div className="flex items-center gap-2">
                        <dt>sha256</dt>
                        <dd className="text-muted" title={item.sha256}>
                          {shortId(item.sha256, 8, 8)}
                        </dd>
                        <CopyButton value={item.sha256} label="Copy sha256" />
                      </div>
                      <div className="flex gap-2">
                        <dt>added</dt>
                        <dd className="text-muted">
                          {formatDate(item.addedAt)} by {item.addedBy}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
