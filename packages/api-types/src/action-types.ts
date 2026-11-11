// Corporate actions, multiplier epochs, lifecycle and NAV strikes of one asset (ADR 0017, ADR 0018),
// read live from the chain. Facts about actions are entered by the registrar and carry the
// evidence's own provenance label; a NAV strike carries the `simulated` and `source` labels the
// publisher signed. Nothing here is marked verified.

import { ACTION_KINDS, ACTION_STATUSES, ASSET_KINDS, LIFECYCLE_STAGES } from "@pontis/domain";
import { z } from "zod";
import { AccountId, EvidenceProvenanceSchema, RationalSchema, Timestamp } from "./common.ts";
import { PriceString } from "./market-types.ts";

export const ActionKindSchema = z.enum(ACTION_KINDS).meta({ id: "ActionKind" });
export const ActionStatusSchema = z.enum(ACTION_STATUSES).meta({ id: "ActionStatus" });
export const AssetKindSchema = z.enum(ASSET_KINDS).meta({ id: "AssetKind" });
export const LifecycleStageSchema = z.enum(LIFECYCLE_STAGES).meta({ id: "LifecycleStage" });

export const LifecycleEntrySchema = z
  .object({
    from: LifecycleStageSchema,
    to: LifecycleStageSchema,
    by: AccountId,
    at: Timestamp,
    evidenceHash: z.string().nullable(),
    note: z.string(),
  })
  .meta({ id: "LifecycleEntry" });

export const DelistRequestSchema = z
  .object({
    by: AccountId,
    at: Timestamp,
    evidenceHash: z.string().nullable(),
    note: z.string(),
  })
  .meta({ id: "DelistRequest" });

export const AssetLifecycleSchema = z
  .object({
    assetId: z.string(),
    kind: AssetKindSchema,
    /** `nav_strike_window` is a reserved name: a fund's window is computed from its strike, see `/nav`. */
    stage: LifecycleStageSchema,
    /** Conversion is refused as `NOT_CONVERTIBLE`. `bridgeOnly` implies it. */
    noConversion: z.boolean(),
    bridgeOnly: z.boolean(),
    /** Append-only, oldest first; empty for an asset that never left `active`. */
    history: z.array(LifecycleEntrySchema),
    /** The registrar's open request to delist, waiting for a second account. */
    delistRequest: DelistRequestSchema.nullable(),
  })
  .meta({ id: "AssetLifecycle" });

export const ActionEvidenceSchema = z
  .object({
    uri: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    provenance: EvidenceProvenanceSchema,
    description: z.string(),
    addedBy: AccountId,
    addedAt: Timestamp,
  })
  .meta({ id: "ActionEvidence" });

export const ActionHistoryEntrySchema = z
  .object({ status: ActionStatusSchema, by: AccountId, at: Timestamp, note: z.string() })
  .meta({ id: "ActionHistoryEntry" });

export const WrapperApplicationSchema = z
  .object({
    representationId: z.string(),
    /** False for a rejected or deprecated wrapper: it does not have to apply the action. */
    live: z.boolean(),
    applied: z.boolean(),
  })
  .meta({ id: "WrapperApplication" });

export const CorporateActionSchema = z
  .object({
    id: z.string(),
    /** The canonical claim the action is about. */
    canonicalAssetId: z.string(),
    kind: ActionKindSchema,
    /** Stored state. A freeze is computed from the clock: see `freezeActive`. */
    status: ActionStatusSchema,
    announcedAt: Timestamp,
    exDate: Timestamp,
    effectiveAt: Timestamp,
    freezeFrom: Timestamp,
    freezeUntil: Timestamp,
    /** True while an approved action's freeze window is open: routes of the claim are closed. */
    freezeActive: z.boolean(),
    /** Every wrapper's multiplier is multiplied by this; null when the action does not move it. */
    multiplierChange: RationalSchema.nullable(),
    evidence: z.array(ActionEvidenceSchema),
    proposedBy: AccountId,
    approvedBy: AccountId.nullable(),
    /** One row per wrapper of the claim. */
    wrappers: z.array(WrapperApplicationSchema),
    history: z.array(ActionHistoryEntrySchema),
  })
  .meta({ id: "CorporateAction" });

export const MultiplierEpochSchema = z
  .object({
    /** Null for the registration multiplier, which has been in force since the start. */
    effectiveAt: Timestamp.nullable(),
    multiplier: RationalSchema,
    /** Null for the registration multiplier. */
    actionId: z.string().nullable(),
  })
  .meta({ id: "MultiplierEpoch" });

export const WrapperEpochsSchema = z
  .object({ representationId: z.string(), epochs: z.array(MultiplierEpochSchema) })
  .meta({ id: "WrapperEpochs" });

export const CorporateActionListSchema = z
  .object({
    assetId: z.string(),
    canonicalAssetId: z.string(),
    /** Oldest first. */
    items: z.array(CorporateActionSchema),
    /** The multiplier schedule of each wrapper of the claim, oldest epoch first. */
    multiplierEpochs: z.array(WrapperEpochsSchema),
  })
  .meta({ id: "CorporateActionList" });

export const NavWindowStateSchema = z
  .enum(["upcoming", "open", "closed"])
  .meta({ id: "NavWindowState" });

export const NavStrikeSchema = z
  .object({
    /** NAV of one whole token in `currency`. */
    navPerUnit: PriceString,
    currency: z.string(),
    asOf: Timestamp,
    /** The strike window is `[asOf, cutoff)`: a fund converts only inside it. */
    cutoff: Timestamp,
    submittedAt: Timestamp,
    /** The label the publisher signed, such as `simulated_feed`; shown as stored. */
    source: z.string(),
    /** True for every strike the demo publishes. Show it. */
    simulated: z.boolean(),
    publisherKey: z.string(),
    windowState: NavWindowStateSchema,
  })
  .meta({ id: "NavStrike" });

export const AssetNavSchema = z
  .object({
    assetId: z.string(),
    kind: AssetKindSchema,
    /** Null for an asset that is not a `nav_fund`, and for a fund before its first strike. */
    strike: NavStrikeSchema.nullable(),
  })
  .meta({ id: "AssetNav" });

export type AssetLifecycle = z.infer<typeof AssetLifecycleSchema>;
export type CorporateAction = z.infer<typeof CorporateActionSchema>;
export type CorporateActionList = z.infer<typeof CorporateActionListSchema>;
export type MultiplierEpoch = z.infer<typeof MultiplierEpochSchema>;
export type NavStrike = z.infer<typeof NavStrikeSchema>;
export type AssetNav = z.infer<typeof AssetNavSchema>;
