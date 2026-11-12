// Endpoints that need a wallet session (ADR 0019, ADR 0020 section 10): redemption requests, the
// issuer back-office queue and gated mints, and the reserve monitor's report. The API never signs
// or sends a user's transaction: where a call must reach the chain it returns unsigned
// `WalletAction`s for the wallet to sign. Nothing here pays anything out; a redemption in this
// demo moves tokens into escrow and burns or returns them, and the issuer is a simulator.

import { MINT_REQUEST_STATUSES, RESERVE_POLICY_ACTIONS, RESERVE_STATES } from "@pontis/domain";
import { z } from "zod";
import { AccountId, AmountString, Timestamp, Uuid } from "./common.ts";
import {
  CUSTODY_LABEL_FIELDS,
  ListQueryFields,
  RedemptionStatusSchema,
  RedemptionSummarySchema,
} from "./custody-types.ts";
import { WalletActionSchema } from "./trading-types.ts";

const Hash64 = z.string().regex(/^[0-9a-f]{64}$/);

export const MintRequestStatusSchema = z.enum(MINT_REQUEST_STATUSES).meta({
  id: "MintRequestStatus",
});

/** The contract's own `ISSUER_SOURCE` style label: who the figures come from. */
const labels = CUSTODY_LABEL_FIELDS;

export const PayoutInstructionSchema = z
  .string()
  .min(4)
  .max(6_000)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "must be base64")
  .meta({
    id: "PayoutInstruction",
    description:
      "The payout instruction, **encrypted by the client**, as padded base64 (at most 4,096 bytes before encoding). The API stores it unread and never returns it; only the SHA-256 of the decoded bytes goes on chain. Never send a plain-text account number or address.",
  });

export const PrepareRedemptionRequestSchema = z
  .strictObject({
    representationId: z.string().min(1).max(64),
    /** Smallest token units; escrowed in full. */
    amount: AmountString.refine((a) => a !== "0", "must be greater than zero"),
    payoutInstruction: PayoutInstructionSchema,
    /** The `termsHash` the client last showed the user; a different current hash is refused as `REDEMPTION_TERMS_CHANGED`. */
    termsHash: Hash64.optional(),
  })
  .meta({ id: "PrepareRedemptionRequest" });

export const PrepareRedemptionResponseSchema = z
  .object({
    /** The id the encrypted payout instruction is stored under. Not the redemption id: that is assigned on chain. */
    prepareId: Uuid,
    representationId: z.string(),
    amount: AmountString,
    /** The terms in force now; the `msg` quotes them and the contract refuses a request made under any other. */
    termsHash: Hash64,
    termsVersion: z.number().int().positive(),
    /** SHA-256 of the decoded ciphertext. */
    payoutInstructionHash: Hash64,
    /** `redeem:{termsHash}:{payoutInstructionHash}`: the `ft_transfer_call` message. */
    msg: z.string(),
    /** What the redemption will record as owed off-chain by the simulated issuer; no value moves. */
    feeUnits: AmountString,
    netUnits: AmountString,
    /** Unsigned: the `ft_transfer_call` of the whole `amount` to the core. Sign and send it with the wallet. */
    actions: z.array(WalletActionSchema).min(1),
    ...labels,
  })
  .meta({ id: "PrepareRedemptionResponse" });

export const RedemptionIntentKindSchema = z
  .enum(["reclaim", "accept", "reject", "fulfil"])
  .meta({ id: "RedemptionIntentKind" });

/** Unsigned actions for one step of a redemption. */
export const RedemptionIntentSchema = z
  .object({
    redemptionId: z.string().regex(/^[0-9]+$/),
    intent: RedemptionIntentKindSchema,
    /** The redemption's status when the actions were built; the chain decides when they run. */
    status: RedemptionStatusSchema,
    actions: z.array(WalletActionSchema).min(1),
    ...labels,
  })
  .meta({ id: "RedemptionIntent" });

export const RejectRedemptionRequestSchema = z
  .strictObject({
    /** 1 to 64 bytes. */
    reason: z
      .string()
      .min(1)
      .refine((r) => new TextEncoder().encode(r).length <= 64, "at most 64 bytes"),
  })
  .meta({ id: "RejectRedemptionRequest" });

export const FulfilRedemptionRequestSchema = z
  .strictObject({
    /** SHA-256 of the issuer's (simulated) settlement evidence, 64 lowercase hex characters. */
    evidenceHash: Hash64,
  })
  .meta({ id: "FulfilRedemptionRequest" });

export const IssuerRedemptionsQuerySchema = z
  .object({
    status: RedemptionStatusSchema.optional(),
    representationId: z.string().max(64).optional(),
    ...ListQueryFields,
  })
  .meta({ id: "IssuerRedemptionsQuery" });

export const IssuerRedemptionListSchema = z
  .object({
    /** Newest first, read from the chain. Payout instructions are never part of a listing. */
    items: z.array(RedemptionSummarySchema),
    /** The issuers whose queues are listed: the ones the account controls, or all for an operator. */
    issuerIds: z.array(z.string()),
    nextCursor: z.string().nullable(),
    ...labels,
  })
  .meta({ id: "IssuerRedemptionList" });

export const MintRequestSchema = z
  .object({
    id: z.string().regex(/^[0-9]+$/),
    assetId: z.string(),
    recipient: AccountId,
    amount: AmountString,
    reference: z.string(),
    /** `minting` while the token call is in flight; `minted` once the contract confirmed it. */
    status: MintRequestStatusSchema,
    requestedBy: AccountId,
    requestedAt: Timestamp,
    resolvedAt: Timestamp.nullable(),
    failure: z.string().nullable(),
    ...labels,
  })
  .meta({ id: "MintRequest" });

export const IssuerMintRequestsQuerySchema = z
  .object({
    status: MintRequestStatusSchema.optional(),
    representationId: z.string().max(64).optional(),
    ...ListQueryFields,
  })
  .meta({ id: "IssuerMintRequestsQuery" });

export const MintRequestListSchema = z
  .object({
    items: z.array(MintRequestSchema),
    issuerIds: z.array(z.string()),
    nextCursor: z.string().nullable(),
    ...labels,
  })
  .meta({ id: "MintRequestList" });

export const CreateMintRequestSchema = z
  .strictObject({
    representationId: z.string().min(1).max(64),
    recipient: AccountId,
    amount: AmountString.refine((a) => a !== "0", "must be greater than zero"),
    /** At most 64 bytes; the issuer's own reference for the subscription. */
    reference: z
      .string()
      .refine((r) => new TextEncoder().encode(r).length <= 64, "at most 64 bytes")
      .default(""),
  })
  .meta({ id: "CreateMintRequest" });

export const MintIntentSchema = z
  .object({
    intent: z.enum(["request", "execute"]),
    /** Null for a new request: the chain assigns the id when the action runs. */
    requestId: z
      .string()
      .regex(/^[0-9]+$/)
      .nullable(),
    assetId: z.string(),
    amount: AmountString,
    /** What the contract would allow to be minted when the actions were built (`execute` only). */
    headroomUnits: AmountString.nullable(),
    actions: z.array(WalletActionSchema).min(1),
    ...labels,
  })
  .meta({ id: "MintIntent" });

export const ReserveMonitorEntrySchema = z
  .object({
    representationId: z.string(),
    /** From `get_reserve_status`; null when that read failed. */
    state: z.enum(RESERVE_STATES).nullable(),
    action: z.enum(RESERVE_POLICY_ACTIONS).nullable(),
    attestedUnits: AmountString.nullable(),
    circulatingUnits: AmountString.nullable(),
    limitUnits: AmountString.nullable(),
    ratioBps: z.number().int().nonnegative().nullable(),
    ageMs: z.number().int().nonnegative().nullable(),
    maxReserveAgeMs: z.number().int().nonnegative(),
    /** The signed `refresh_supply` and `evaluate_reserve` calls went through. False without a signer. */
    refreshedSupply: z.boolean(),
    evaluated: z.boolean(),
    simulated: z.boolean(),
    sources: z.array(z.string()),
    error: z.string().nullable(),
  })
  .meta({ id: "ReserveMonitorEntry" });

export const ReserveMonitorReportSchema = z
  .object({
    /** `NEVER_RUN` until the indexer's monitor has finished once. */
    status: z.enum(["OK", "ATTENTION", "NEVER_RUN"]),
    ranAt: Timestamp.nullable(),
    /** The account that signed the monitor's calls; null when it only reads. */
    signer: AccountId.nullable(),
    entries: z.array(ReserveMonitorEntrySchema),
    /** Representations whose reserves are breached. */
    breaches: z.array(z.string()),
    stale: z.array(z.string()),
    /** Representations whose reads or calls failed in the last pass. */
    failed: z.array(z.string()),
    simulated: z.literal(true),
    source: z.literal("reserve_monitor"),
    notice: z.string(),
  })
  .meta({ id: "ReserveMonitorReport" });

export type PrepareRedemptionRequest = z.infer<typeof PrepareRedemptionRequestSchema>;
export type PrepareRedemptionResponse = z.infer<typeof PrepareRedemptionResponseSchema>;
export type RedemptionIntent = z.infer<typeof RedemptionIntentSchema>;
export type IssuerRedemptionList = z.infer<typeof IssuerRedemptionListSchema>;
export type MintRequest = z.infer<typeof MintRequestSchema>;
export type MintRequestList = z.infer<typeof MintRequestListSchema>;
export type MintIntent = z.infer<typeof MintIntentSchema>;
export type ReserveMonitorReport = z.infer<typeof ReserveMonitorReportSchema>;
