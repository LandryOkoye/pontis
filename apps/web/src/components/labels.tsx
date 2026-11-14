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

/** The trust label: outlined so it never reads as a status or a call to action. */
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
        "inline-flex items-center whitespace-nowrap rounded-sm border font-medium",
        unverified ? "border-warn/30 text-warn" : "border-parity/30 text-parity",
        size === "lg" ? "h-7 gap-2 px-2.5 text-[12.5px]" : "h-[22px] gap-1.5 px-2 text-[11.5px]",
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
