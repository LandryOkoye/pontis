// Wire-level building blocks. Amounts are canonical integer strings of smallest units, timestamps
// are ISO-8601 UTC strings, ratios are `{num, den}` of positive integer strings (BuildPlan §8).

import {
  COMPATIBILITY_CLASSIFICATIONS,
  ERROR_CODES,
  EVIDENCE_PROVENANCES,
  EVIDENCE_SUBJECT_TYPES,
  FINDING_SEVERITIES,
  NETWORKS,
  RECORD_STATUSES,
  RELATIONSHIP_STATUSES,
  REFUSAL_CODES,
  REVIEW_ACTIONS,
  ROUTE_TYPES,
  QUOTE_STATES,
  TX_HASH_STATUSES,
  RECONCILIATION_KINDS,
  VERIFICATION_STATUSES,
  isAmountString,
} from "@pontis/domain";
import { z } from "zod";

/** Non-negative integer string in smallest units, within u128. */
export const AmountString = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine(isAmountString, "exceeds u128")
  .meta({
    id: "AmountString",
    description: "Non-negative integer in smallest token units, as a decimal string (max u128).",
    example: "1000000",
  });

/** ISO-8601 UTC timestamp, e.g. `2026-11-07T18:00:00.000Z`. */
export const Timestamp = z.iso.datetime().meta({
  id: "Timestamp",
  description: "ISO-8601 UTC timestamp.",
  example: "2026-11-07T18:00:00.000Z",
});

const PositiveInteger = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine(isAmountString, "exceeds u128");

export const RationalSchema = z.object({ num: PositiveInteger, den: PositiveInteger }).meta({
  id: "Rational",
  description: "Positive rational in lowest terms. No floating point is used anywhere.",
  example: { num: "1000", den: "1" },
});

/** NEAR account ID (lowercase, 2-64 chars). */
export const AccountId = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+([_.-][a-z0-9]+)*$/)
  .meta({ id: "AccountId", description: "NEAR account ID.", example: "alice.testnet" });

export const TxHash = z.string().min(32).max(64).meta({
  id: "TxHash",
  description: "NEAR transaction hash (base58).",
  example: "9ZkBqE3nVhJ2pJt8h4Y8yH5m3xKcM6W7kQ1sF2dRnA4T",
});

export const Uuid = z.uuid().meta({ id: "Uuid" });

export const RecordStatusSchema = z.enum(RECORD_STATUSES).meta({ id: "RecordStatus" });
export const VerificationStatusSchema = z
  .enum(VERIFICATION_STATUSES)
  .meta({ id: "VerificationStatus" });
export const EvidenceProvenanceSchema = z
  .enum(EVIDENCE_PROVENANCES)
  .meta({ id: "EvidenceProvenance" });
export const EvidenceSubjectTypeSchema = z
  .enum(EVIDENCE_SUBJECT_TYPES)
  .meta({ id: "EvidenceSubjectType" });
export const NetworkSchema = z.enum(NETWORKS).meta({ id: "Network" });
export const ClassificationSchema = z
  .enum(COMPATIBILITY_CLASSIFICATIONS)
  .meta({ id: "CompatibilityClassification" });
export const RelationshipStatusSchema = z
  .enum(RELATIONSHIP_STATUSES)
  .meta({ id: "RelationshipStatus" });
export const ReviewActionSchema = z.enum(REVIEW_ACTIONS).meta({ id: "ReviewAction" });
export const RouteTypeSchema = z.enum(ROUTE_TYPES).meta({ id: "RouteType" });
export const RefusalCodeSchema = z.enum(REFUSAL_CODES).meta({ id: "RefusalCode" });
export const QuoteStateSchema = z.enum(QUOTE_STATES).meta({ id: "QuoteState" });
export const TxHashStatusSchema = z.enum(TX_HASH_STATUSES).meta({
  id: "TxHashStatus",
  description:
    "NONE: no hash reported. REPORTED: sent by the wallet, not confirmed on chain. VERIFIED: the chain shows it is this conversion's transaction. REJECTED: the chain shows it is not.",
});
export const FindingKindSchema = z.enum(RECONCILIATION_KINDS).meta({ id: "ReconciliationKind" });
export const FindingSeveritySchema = z.enum(FINDING_SEVERITIES).meta({ id: "FindingSeverity" });
export const ErrorCodeSchema = z.enum(ERROR_CODES).meta({ id: "ErrorCode" });

/** Structured error returned for every non-2xx response (brief §10.1). */
export const ApiErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string(),
    /** Field-level detail for `VALIDATION_ERROR`; otherwise absent. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    /** Present on rate-limit errors. */
    retryAfterSeconds: z.number().int().positive().optional(),
  })
  .meta({
    id: "ApiError",
    description: "Structured error. `code` is stable; `message` is for humans.",
  });
export type ApiError = z.infer<typeof ApiErrorSchema>;
