// Custody, reserves, redemption terms and issuer reliability (ADR 0020), read from the chain.
// Nothing here is custodied, backed or audited. In the demo every custodian and issuer is a
// simulator holding test keys, so each response says `simulated` and names its `sources`; a
// reserve figure is a signed claim by a fictional custodian, never a verified balance.

import {
  CUSTODIAN_STATUSES,
  CUSTODY_STRUCTURES,
  REDEMPTION_MISSES,
  REDEMPTION_STATUSES,
  RESERVE_POLICY_ACTIONS,
  RESERVE_STATES,
} from "@pontis/domain";
import { z } from "zod";
import { ActionEvidenceSchema } from "./action-types.ts";
import { AccountId, AmountString, Timestamp, VerificationStatusSchema } from "./common.ts";

export const CustodyStructureSchema = z.enum(CUSTODY_STRUCTURES).meta({ id: "CustodyStructure" });
export const CustodianStatusSchema = z.enum(CUSTODIAN_STATUSES).meta({ id: "CustodianStatus" });
export const ReserveStateSchema = z.enum(RESERVE_STATES).meta({
  id: "ReserveState",
  description:
    "`ok`, `breached` (supply above attested reserves plus tolerance), `stale` (oldest attestation older than the policy allows), `no_attestation`, or `unmonitored` (no reserve policy: nothing is enforced).",
});
export const ReservePolicyActionSchema = z
  .enum(RESERVE_POLICY_ACTIONS)
  .meta({ id: "ReservePolicyAction" });
export const RedemptionStatusSchema = z.enum(REDEMPTION_STATUSES).meta({ id: "RedemptionStatus" });

/** Every response of this file carries these two, and a plain statement of what the figures are. */
const labels = {
  /** True for every figure the demo produces. Show it next to the figure. */
  simulated: z.boolean(),
  /** The labels the signers put on the figures, such as `simulated_custodian`; shown as stored. */
  sources: z.array(z.string()),
  /** What the figures are not: show it near them. */
  notice: z.string(),
};

const ListQueryFields = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
};
export const CustodyListQuerySchema = z.object(ListQueryFields).meta({ id: "CustodyListQuery" });

export const CustodianSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    jurisdiction: z.string().nullable(),
    /** The key whose signature the contract accepts for this custodian's reserve attestations. */
    attesterKey: z.string(),
    status: CustodianStatusSchema,
    /** As registered. The contract refuses `independently_verified`; nothing here is verified. */
    synthetic: z.boolean(),
    verificationStatus: VerificationStatusSchema,
    evidence: z.array(ActionEvidenceSchema),
    registeredBy: AccountId,
    registeredAt: Timestamp,
    ...labels,
  })
  .meta({ id: "Custodian" });

export const CustodianListSchema = z
  .object({
    items: z.array(CustodianSchema),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
    ...labels,
  })
  .meta({ id: "CustodianList" });

export const AssetCustodySchema = z
  .object({
    assetId: z.string(),
    /** False until the registrar links the representation to its custodians. */
    linked: z.boolean(),
    structure: CustodyStructureSchema.nullable(),
    custodians: z.array(CustodianSchema),
    linkedBy: AccountId.nullable(),
    linkedAt: Timestamp.nullable(),
    ...labels,
  })
  .meta({ id: "AssetCustody" });

/** One stored reserve attestation: a figure a custodian signed, with the label it put on it. */
export const ReserveAttestationSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    custodianId: z.string(),
    /** Smallest units of the representation token: the unit of its total supply. */
    reservedUnits: AmountString,
    asOf: Timestamp,
    submittedAt: Timestamp,
    reportUri: z.string(),
    /** SHA-256 of the report the custodian pointed to; the report itself is not fetched or checked. */
    reportHash: z.string().regex(/^[0-9a-f]{64}$/),
    attesterKey: z.string(),
    simulated: z.boolean(),
    source: z.string(),
  })
  .meta({ id: "ReserveAttestation" });

export const LatestReserveAttestationSchema = ReserveAttestationSchema.extend({
  /** Milliseconds from `asOf` to this response. */
  ageMs: z.number().int().nonnegative(),
  /** True while `ageMs` is within the policy's `maxReserveAgeMs`; false when no policy is set. */
  fresh: z.boolean(),
}).meta({ id: "LatestReserveAttestation" });

export const ReserveCustodianLineSchema = z
  .object({
    custodianId: z.string(),
    custodianName: z.string(),
    custodianStatus: CustodianStatusSchema,
    /** Only an active custodian's attestation counts towards the total. */
    counted: z.boolean(),
    /** Null while this custodian has not attested for the asset. */
    latest: LatestReserveAttestationSchema.nullable(),
  })
  .meta({ id: "ReserveCustodianLine" });

export const ReservePolicySchema = z
  .object({
    action: ReservePolicyActionSchema,
    /** Allowed supply above attested reserves, in basis points of the attested figure. */
    toleranceBps: z.number().int().min(0).max(1_000),
    maxReserveAgeMs: z.number().int().positive(),
  })
  .meta({ id: "ReservePolicy" });

export const ReserveFreshnessSchema = z
  .enum(["fresh", "stale", "none"])
  .meta({ id: "ReserveFreshness" });

export const AssetReservesSchema = z
  .object({
    assetId: z.string(),
    monitored: z.boolean(),
    state: ReserveStateSchema,
    /** Null for an unmonitored asset. */
    policy: ReservePolicySchema.nullable(),
    attestedUnits: AmountString,
    limitUnits: AmountString,
    /** The supply the contract trusts: the larger of its mint ledger and the last token read. */
    circulatingUnits: AmountString,
    /** What may still be minted through the gate; tolerance never applies to minting. */
    headroomUnits: AmountString,
    /** Attested over circulating, in basis points, rounded down; null while nothing circulates. */
    ratioBps: z.number().int().nonnegative().nullable(),
    /** `ratioBps` as a percentage with two decimals, for display, such as `125.00`. */
    ratioPercent: z.string().nullable(),
    freshness: ReserveFreshnessSchema,
    oldestAsOf: Timestamp.nullable(),
    ageMs: z.number().int().nonnegative().nullable(),
    supplyReadAt: Timestamp.nullable(),
    /** True when conversions of this asset are refused now (`RESERVE_RESTRICTED` or `RESERVE_STALE`). */
    restrictsConversions: z.boolean(),
    mintPaused: z.boolean(),
    custodians: z.array(ReserveCustodianLineSchema),
    /** Plain-language reading of `state` for this asset. */
    explanation: z.string(),
    ...labels,
  })
  .meta({ id: "AssetReserves" });

export const ReserveHistorySchema = z
  .object({
    assetId: z.string(),
    /** Newest first. The chain keeps the last 500 per asset; older ones are not served here. */
    items: z.array(ReserveAttestationSchema),
    total: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
    ...labels,
  })
  .meta({ id: "ReserveHistory" });

export const RedemptionWindowSchema = z
  .object({
    /** True when the window never closes (period 0). */
    alwaysOpen: z.boolean(),
    anchorAt: Timestamp.nullable(),
    lengthMs: z.number().int().nonnegative(),
    periodMs: z.number().int().nonnegative(),
    /** Whether the window is open at this response. */
    open: z.boolean(),
    /** When it next opens; null while open or when it never closes. */
    nextOpenAt: Timestamp.nullable(),
  })
  .meta({ id: "RedemptionWindow" });

export const RedemptionTermsBodySchema = z
  .object({
    minAmount: AmountString,
    /** Null when there is no maximum. */
    maxAmount: AmountString.nullable(),
    feeBps: z.number().int().min(0).max(1_000),
    window: RedemptionWindowSchema,
    /** The issuer's time to accept a request, in milliseconds. */
    acceptWithinMs: z.number().int().positive(),
    /** The issuer's time to fulfil after accepting, in days. */
    settlementDays: z.number().int().min(1).max(30),
  })
  .meta({ id: "RedemptionTermsBody" });

export const AssetRedemptionTermsSchema = z
  .object({
    assetId: z.string(),
    /** The canonical asset's free-text description of how redemption works; not enforced. */
    description: z.string(),
    /** Null until the registrar sets enforced terms: the asset cannot be redeemed through Pontis. */
    terms: RedemptionTermsBodySchema.nullable(),
    version: z.number().int().positive().nullable(),
    /** Part of the redeem message: a request made under other terms is refused. */
    termsHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    setBy: AccountId.nullable(),
    setAt: Timestamp.nullable(),
    ...labels,
  })
  .meta({ id: "AssetRedemptionTerms" });

const RateBps = z.number().int().min(0).max(10_000).nullable();

export const IssuerReliabilitySchema = z
  .object({
    issuerId: z.string(),
    /** Counters kept by the contract. */
    requested: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    fulfilled: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    acceptMisses: z.number().int().nonnegative(),
    fulfilMisses: z.number().int().nonnegative(),
    reclaimed: z.number().int().nonnegative(),
    lastMissAt: Timestamp.nullable(),
    /** Derived by the API from the counters; not stored on chain. */
    score: z
      .object({
        /** Fulfilled over requested, in basis points; null before any request. */
        fulfilmentRateBps: RateBps,
        /** Requests that expired unaccepted, over requested. */
        acceptMissRateBps: RateBps,
        /** Accepted requests that expired unfulfilled, over accepted. */
        fulfilMissRateBps: RateBps,
        avgAcceptLatencyMs: z.number().int().nonnegative().nullable(),
        avgSettleLatencyMs: z.number().int().nonnegative().nullable(),
      })
      .meta({ id: "IssuerReliabilityScore" }),
    ...labels,
  })
  .meta({ id: "IssuerReliability" });

export const RedemptionFields = {
  /** The contract's counter, as a string. */
  id: z.string().regex(/^[0-9]+$/),
  user: AccountId,
  assetId: z.string(),
  issuerId: z.string(),
  /** Escrowed in full; on fulfilment the whole amount is burned. */
  amount: AmountString,
  feeBps: z.number().int().min(0).max(1_000),
  /** What a simulated issuer keeps and owes off-chain; no value moves except the token. */
  feeUnits: AmountString,
  netUnits: AmountString,
  termsHash: z.string(),
  termsVersion: z.number().int().positive(),
  /** SHA-256 of the encrypted payout instruction, which is stored off-chain. */
  payoutInstructionHash: z.string(),
  status: RedemptionStatusSchema,
  createdAt: Timestamp,
  acceptDeadline: Timestamp,
  acceptedAt: Timestamp.nullable(),
  fulfilDeadline: Timestamp.nullable(),
  resolvedAt: Timestamp.nullable(),
  fulfilmentEvidenceHash: z.string().nullable(),
  rejectReason: z.string().nullable(),
  /** Which deadline the issuer missed when the request expired. */
  miss: z.enum(REDEMPTION_MISSES).nullable(),
  settlementDays: z.number().int().min(1).max(30),
  /** The user can reclaim the escrow now (`rejected` or `expired`). */
  reclaimable: z.boolean(),
  ...labels,
};

export const RedemptionSummarySchema = z.object(RedemptionFields).meta({ id: "RedemptionSummary" });

export const RedemptionEventSchema = z
  .object({
    event: RedemptionStatusSchema,
    /** Null when the chain view does not keep the time of an earlier step. */
    at: Timestamp.nullable(),
    /** Null until the indexer's event mirror supplies it. */
    txHash: z.string().nullable(),
  })
  .meta({ id: "RedemptionEvent" });

export const RedemptionSchema = z
  .object({ ...RedemptionFields, timeline: z.array(RedemptionEventSchema) })
  .meta({ id: "Redemption" });

export const RedemptionListSchema = z
  .object({
    /** Newest first. */
    items: z.array(RedemptionSummarySchema),
    nextCursor: z.string().nullable(),
    ...labels,
  })
  .meta({ id: "RedemptionList" });

export const ListRedemptionsQuerySchema = z
  .object({
    user: AccountId.optional(),
    representationId: z.string().max(64).optional(),
    status: RedemptionStatusSchema.optional(),
    ...ListQueryFields,
  })
  .meta({ id: "ListRedemptionsQuery" });

/** The camelCase twin of the contract's `ReserveAttestation` argument (ADR 0020 section 3). */
export const ReserveAttestationInputSchema = z
  .strictObject({
    version: z.literal(1),
    /** Must be the contract account the attestation was signed for. */
    contract: AccountId,
    representationId: z.string().min(1).max(64),
    custodianId: z.string().min(1).max(64),
    reservedUnits: AmountString,
    asOfMs: z.number().int().nonnegative(),
    reportHash: z.string().regex(/^[0-9a-f]{64}$/),
    reportUri: z.string().max(256),
    simulated: z.boolean(),
    source: z.string().min(1).max(64),
  })
  .meta({ id: "ReserveAttestationInput" });

export const SubmitReserveAttestationRequestSchema = z
  .strictObject({
    attestation: ReserveAttestationInputSchema,
    /** Base64 ed25519 signature over the Borsh message of ADR 0020 section 3. */
    signature: z.string().min(1).max(200),
    /** `ed25519:<base58>`; must be the custodian's registered key. */
    publicKey: z.string().min(10).max(120),
  })
  .meta({ id: "SubmitReserveAttestationRequest" });

export const SubmitReserveAttestationResponseSchema = z
  .object({
    /** The relayer's transaction. The contract, not this API, decided whether the attestation counts. */
    txHash: z.string(),
    representationId: z.string(),
    custodianId: z.string(),
    simulated: z.boolean(),
  })
  .meta({ id: "SubmitReserveAttestationResponse" });

export type Custodian = z.infer<typeof CustodianSchema>;
export type CustodianList = z.infer<typeof CustodianListSchema>;
export type AssetCustody = z.infer<typeof AssetCustodySchema>;
export type ReserveAttestation = z.infer<typeof ReserveAttestationSchema>;
export type AssetReserves = z.infer<typeof AssetReservesSchema>;
export type ReserveHistory = z.infer<typeof ReserveHistorySchema>;
export type AssetRedemptionTerms = z.infer<typeof AssetRedemptionTermsSchema>;
export type IssuerReliability = z.infer<typeof IssuerReliabilitySchema>;
export type RedemptionSummary = z.infer<typeof RedemptionSummarySchema>;
export type Redemption = z.infer<typeof RedemptionSchema>;
export type RedemptionList = z.infer<typeof RedemptionListSchema>;
export type SubmitReserveAttestationRequest = z.infer<typeof SubmitReserveAttestationRequestSchema>;
export type SubmitReserveAttestationResponse = z.infer<
  typeof SubmitReserveAttestationResponseSchema
>;
