// Routes, quotes, conversions and transactions.
import { z } from "zod";
import {
  AccountId,
  AmountString,
  NetworkSchema,
  QuoteStateSchema,
  RationalSchema,
  RefusalCodeSchema,
  RouteTypeSchema,
  Timestamp,
  TxHash,
  Uuid,
} from "./common.ts";

export const RouteDescriptorSchema = z
  .object({
    type: RouteTypeSchema,
    venue: z.literal("CONTROLLED_TEST_VAULT"),
    network: NetworkSchema,
    settlement: z.literal("ATOMIC"),
    description: z.string(),
  })
  .meta({ id: "RouteDescriptor" });

export const WarningSchema = z
  .object({ code: z.string(), message: z.string() })
  .meta({ id: "Warning" });

// POST /v1/routes/compare
export const CompareRoutesRequestSchema = z
  .strictObject({ fromId: z.string(), toId: z.string(), amount: AmountString.optional() })
  .meta({ id: "CompareRoutesRequest" });

export const RouteOptionSchema = z
  .object({
    type: RouteTypeSchema,
    executable: z.boolean(),
    /** Present when `executable` is false. */
    reasonCode: RefusalCodeSchema.optional(),
    /** Human explanation of why the route is or is not available (brief §6.7). */
    explanation: z.string(),
    /** Approved ratio from `fromId` to `toId`; present when a relationship exists. */
    ratio: RationalSchema.optional(),
    compatibilityVersion: z.number().int().positive().optional(),
  })
  .meta({ id: "RouteOption" });

export const CompareRoutesResponseSchema = z
  .object({ routes: z.array(RouteOptionSchema) })
  .meta({ id: "CompareRoutesResponse" });

// POST /v1/quotes
export const CreateQuoteRequestSchema = z
  .strictObject({
    fromId: z.string(),
    toId: z.string(),
    amountIn: AmountString,
    accountId: AccountId,
  })
  .meta({ id: "CreateQuoteRequest" });

export const QuoteSchema = z
  .object({
    id: Uuid,
    fromId: z.string(),
    toId: z.string(),
    accountId: AccountId,
    amountIn: AmountString,
    /** floor(amountIn * ratio) */
    amountOutGross: AmountString,
    /** ceil(amountOutGross * feeBps / 10000), taken from the output token */
    fee: AmountString,
    /** amountOutGross - fee: what the user receives */
    amountOut: AmountString,
    ratio: RationalSchema,
    feeBps: z.number().int().min(0).max(10_000),
    expiresAt: Timestamp,
    route: RouteDescriptorSchema,
    compatibilityVersion: z.number().int().positive(),
    policyVersion: z.number().int().nonnegative(),
    warnings: z.array(WarningSchema),
    state: QuoteStateSchema,
    createdAt: Timestamp,
  })
  .meta({ id: "Quote" });

// POST /v1/conversions
export const IdempotencyKeyHeaderSchema = z.object({
  "idempotency-key": z.string().min(8).max(128).meta({
    description:
      "Client-generated unique key. Repeating a request with the same key returns the original result.",
    example: "7f9c2a52-4a3e-4a53-8f06-2b9a0a6f3e11",
  }),
});

export const CreateConversionRequestSchema = z
  .strictObject({ quoteId: Uuid })
  .meta({ id: "CreateConversionRequest" });

/** One NEAR FunctionCall action for the wallet to sign. The backend never signs for users. */
export const WalletActionSchema = z
  .object({
    receiverId: AccountId,
    methodName: z.string(),
    args: z.record(z.string(), z.unknown()),
    /** Gas units, decimal string. */
    gas: z.string().regex(/^[0-9]+$/),
    /** Attached deposit in yoctoNEAR, decimal string. */
    deposit: z.string().regex(/^[0-9]+$/),
  })
  .meta({ id: "WalletAction" });

export const CreateConversionResponseSchema = z
  .object({
    conversionId: Uuid,
    quoteId: Uuid,
    /** Ordered; sign and send as one transaction per distinct `receiverId`, in this order. */
    actions: z.array(WalletActionSchema).min(1),
  })
  .meta({ id: "CreateConversionResponse" });

export const SubmittedRequestSchema = z
  .strictObject({ txHash: TxHash })
  .meta({ id: "SubmittedRequest" });

// Transactions
export const SettlementEventSchema = z
  .object({
    eventName: z.string(),
    receiptId: z.string(),
    logIndex: z.number().int().nonnegative(),
    blockHeight: z.number().int().nonnegative(),
    blockTimestamp: Timestamp,
    txHash: TxHash,
    data: z.unknown(),
  })
  .meta({ id: "SettlementEvent" });

export const TransactionSchema = z
  .object({
    /** Conversion ID. */
    id: Uuid,
    quote: QuoteSchema,
    state: QuoteStateSchema,
    txHash: TxHash.nullable(),
    failureReason: z.string().nullable(),
    events: z.array(SettlementEventSchema),
    createdAt: Timestamp,
    submittedAt: Timestamp.nullable(),
    settledAt: Timestamp.nullable(),
  })
  .meta({ id: "Transaction" });

export const ListTransactionsQuerySchema = z.object({
  account: AccountId,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type RouteDescriptor = z.infer<typeof RouteDescriptorSchema>;
export type CompareRoutesRequest = z.infer<typeof CompareRoutesRequestSchema>;
export type CompareRoutesResponse = z.infer<typeof CompareRoutesResponseSchema>;
export type CreateQuoteRequest = z.infer<typeof CreateQuoteRequestSchema>;
export type Quote = z.infer<typeof QuoteSchema>;
export type CreateConversionRequest = z.infer<typeof CreateConversionRequestSchema>;
export type WalletAction = z.infer<typeof WalletActionSchema>;
export type CreateConversionResponse = z.infer<typeof CreateConversionResponseSchema>;
export type SubmittedRequest = z.infer<typeof SubmittedRequestSchema>;
export type SettlementEvent = z.infer<typeof SettlementEventSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
