// GET /v1/admin/reconciliation (BuildPlan B13): what the reconciler last found, plus the quotes
// currently waiting for a person. Admin only.

import { z } from "zod";
import {
  AccountId,
  AmountString,
  FindingKindSchema,
  FindingSeveritySchema,
  Timestamp,
  Uuid,
} from "./common.ts";

export const AdminAuthHeaderSchema = z.object({
  authorization: z.string().meta({
    description: "`Bearer <ADMIN_API_KEY>`.",
    example: "Bearer 0123456789abcdef0123456789abcdef",
  }),
});

export const ReconciliationFindingSchema = z
  .object({
    /** Stable across runs, so a finding that persists keeps its `firstSeenAt`. */
    key: z.string(),
    kind: FindingKindSchema,
    severity: FindingSeveritySchema,
    /** The quote ID or representation ID the finding is about. */
    subject: z.string(),
    message: z.string(),
    firstSeenAt: Timestamp,
  })
  .meta({ id: "ReconciliationFinding" });

export const VaultReadingSchema = z
  .object({
    representationId: z.string(),
    tokenAccountId: AccountId,
    /** What `pontis-core` records as owed to the vault. */
    inventory: AmountString,
    /** What the token contract says `pontis-core` holds. */
    balance: AmountString,
  })
  .meta({ id: "VaultReading" });

/** One reconciler run, as stored. */
export const ReconciliationRunSchema = z
  .object({
    ranAt: Timestamp,
    findings: z.array(ReconciliationFindingSchema),
    vaults: z.array(VaultReadingSchema),
  })
  .meta({ id: "ReconciliationRun" });

export const FlaggedQuoteSchema = z
  .object({
    quoteId: Uuid,
    conversionId: Uuid.nullable(),
    reason: z.string().nullable(),
    flaggedAt: Timestamp,
  })
  .meta({ id: "FlaggedQuote" });

export const ReconciliationReportSchema = z
  .object({
    /** `NEVER_RUN` until the reconciler has finished once. */
    status: z.enum(["OK", "ATTENTION", "NEVER_RUN"]),
    ranAt: Timestamp.nullable(),
    findings: z.array(ReconciliationFindingSchema),
    vaults: z.array(VaultReadingSchema),
    requiresReconciliation: z.array(FlaggedQuoteSchema),
  })
  .meta({ id: "ReconciliationReport" });

export type ReconciliationFinding = z.infer<typeof ReconciliationFindingSchema>;
export type VaultReading = z.infer<typeof VaultReadingSchema>;
export type ReconciliationRun = z.infer<typeof ReconciliationRunSchema>;
export type FlaggedQuote = z.infer<typeof FlaggedQuoteSchema>;
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;
