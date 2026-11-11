// The guard breakdown of one route (ADR 0016 section 6): every check with its verdict, the fee the
// contract will charge, and the reference prices behind the deviation check, each with the honesty
// label the contract stores with it.

import { z } from "zod";
import { AmountString, RefusalCodeSchema, Timestamp } from "./common.ts";
import { PriceString } from "./market-types.ts";

export const GuardCheckSchema = z
  .object({
    /** `route`, `guard`, `price_freshness`, `circuit_breaker`, `amount_limits`, `vault_inventory`. */
    name: z.string(),
    passed: z.boolean(),
    detail: z.string(),
    /** The refusal a quote would carry when this check fails. */
    reasonCode: RefusalCodeSchema.optional(),
  })
  .meta({ id: "GuardCheck" });

export const ReferencePriceSchema = z
  .object({
    representationId: z.string(),
    price: PriceString,
    currency: z.string(),
    asOf: Timestamp,
    /** Milliseconds between the price time and this response. */
    ageMs: z.number().int().nonnegative(),
    /** The label the publisher signed, such as `simulated_feed`; shown as stored. */
    source: z.string(),
    /** True for every price the demo publishes. Show it. */
    simulated: z.boolean(),
  })
  .meta({ id: "ReferencePrice" });

export const RouteGuardsQuerySchema = z
  .strictObject({ amount: AmountString.optional() })
  .meta({ id: "RouteGuardsQuery" });

export const RouteGuardsResponseSchema = z
  .object({
    fromId: z.string(),
    toId: z.string(),
    amount: AmountString.nullable(),
    executable: z.boolean(),
    /** False when no guard is set on the pair: it converts at the fixed ratio as before. */
    guarded: z.boolean(),
    /** A stale or missing price is tolerated at a wider fee. */
    degraded: z.boolean(),
    /** The fee the contract will charge for `amount`, skew included; null without an amount. */
    feeBps: z.number().int().nonnegative().nullable(),
    /** The part of `feeBps` that the vault's depletion earns. */
    skewBps: z.number().int().nonnegative().nullable(),
    checks: z.array(GuardCheckSchema),
    prices: z.array(ReferencePriceSchema),
  })
  .meta({ id: "RouteGuardsResponse" });

export type GuardCheck = z.infer<typeof GuardCheckSchema>;
export type ReferencePrice = z.infer<typeof ReferencePriceSchema>;
export type RouteGuardsResponse = z.infer<typeof RouteGuardsResponseSchema>;
