// Trust and state labels. These are part of the design, not disclaimers bolted on afterwards:
// every asset, issuer and claim carries its SYNTHETIC / UNVERIFIED hallmark wherever it appears.
import type {
  CompatibilityClassification,
  EvidenceProvenance,
  QuoteState,
  RecordStatus,
  VerificationStatus,
} from "@pontis/domain";
import { cn } from "../lib/cn.ts";
import { CLASSIFICATION, PROVENANCE, RECORD, STATE, VERIFICATION } from "../lib/copy.ts";
import { Chip } from "./ui/primitives.tsx";

/** An assay-style stamp: dashed double border, mono caps. */
export function Hallmark({
  synthetic,
  verification,
  size = "sm",
  className,
}: {
  synthetic: boolean;
  verification: VerificationStatus;
  size?: "sm" | "lg";
  className?: string;
}) {
  const parts = [synthetic ? "Synthetic" : null, VERIFICATION[verification].label].filter(Boolean);
  const unverified = verification === "unverified" || verification === "issuer_attested";
  return (
    <span
      title={
        unverified
          ? "A synthetic test record. Nothing about it was checked by a third party."
          : VERIFICATION[verification].label
      }
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[6px] border border-dashed font-mono uppercase",
        unverified ? "border-warn/50 text-warn" : "border-parity/50 text-parity",
        size === "lg"
          ? "h-8 gap-2.5 px-3 text-[11.5px] tracking-[0.18em]"
          : "h-[22px] gap-1.5 px-2 text-[10px] tracking-[0.14em]",
        "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(242_174_82/0.06)_6px_7px)]",
        className,
      )}
    >
      {parts.map((part, i) => (
        <span key={part} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span className="opacity-50" aria-hidden>
              ·
            </span>
          )}
          {part}
        </span>
      ))}
    </span>
  );
}

export function StateBadge({ state }: { state: QuoteState }) {
  const meta = STATE[state];
  const live = state === "SUBMITTED" || state === "ACCEPTED" || state === "QUOTED";
  return (
    <Chip tone={meta.tone} dot pulse={live} title={meta.meaning}>
      {meta.label}
    </Chip>
  );
}

export function ClassificationBadge({
  value,
  className,
}: {
  value: CompatibilityClassification;
  className?: string;
}) {
  const meta = CLASSIFICATION[value];
  return (
    <Chip tone={meta.tone} dot title={meta.meaning} {...(className ? { className } : {})}>
      {meta.label}
    </Chip>
  );
}

export function RecordBadge({ status }: { status: RecordStatus }) {
  const meta = RECORD[status];
  return (
    <Chip tone={meta.tone} dot>
      {meta.label}
    </Chip>
  );
}

export function ProvenanceBadge({ value }: { value: EvidenceProvenance }) {
  const meta = PROVENANCE[value];
  return (
    <Chip tone={meta.tone} title={meta.meaning}>
      {meta.label}
    </Chip>
  );
}
