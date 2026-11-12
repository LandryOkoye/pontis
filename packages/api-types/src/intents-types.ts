import { z } from "zod";

export const IntentQuoteRequestSchema = z
  .object({
    swapType: z.enum(["EXACT_INPUT", "EXACT_OUTPUT"]),
    slippageTolerance: z.number().int().min(0).max(10_000),
    originAsset: z.string().min(1),
    destinationAsset: z.string().min(1),
    amount: z.string().regex(/^\d+$/),
    depositType: z.string().min(1),
    recipient: z.string().min(1),
    recipientType: z.string().min(1),
    refundTo: z.string().min(1),
    refundType: z.string().min(1),
    deadline: z.iso.datetime({ offset: true }),
    confidentiality: z.enum(["basic", "advanced"]).optional(),
  })
  .strict()
  .meta({ id: "IntentQuoteRequest" });

export const IntentQuoteSchema = z
  .object({
    quoteId: z.string(),
    amountIn: z.string(),
    amountOut: z.string(),
    minAmountOut: z.string(),
    depositAddress: z.string().optional(),
    deadline: z.string(),
    source: z.enum(["near_intents_1click", "simulated_intents"]),
    simulated: z.boolean(),
    confidentiality: z.enum(["public", "basic", "advanced"]),
  })
  .meta({ id: "IntentQuote" });

export const IntentAssetSchema = z
  .object({
    assetId: z.string(),
    symbol: z.string(),
    decimals: z.number().int().nonnegative(),
    blockchain: z.string(),
    simulated: z.boolean(),
  })
  .meta({ id: "IntentAsset" });

export const IntentTokensResponseSchema = z
  .object({
    assets: z.array(IntentAssetSchema),
    source: z.enum(["near_intents_1click", "simulated_intents"]),
    simulated: z.boolean(),
  })
  .meta({ id: "IntentTokensResponse" });

export const IntentStatusSchema = z
  .object({
    status: z.string(),
    updatedAt: z.string().optional(),
    source: z.enum(["near_intents_1click", "simulated_intents"]),
    simulated: z.boolean(),
  })
  .meta({ id: "IntentStatus" });

export const PrivateRfqEncryptedOrderSchema = z
  .object({
    ciphertext: z.string(),
    ephemeralPublicKey: z.string(),
    nonce: z.string(),
  })
  .strict()
  .meta({ id: "PrivateRfqEncryptedOrder" });

export const PrivateRfqSettlementSchema = z
  .object({
    settlementId: z.string(),
    assetId: z.string(),
    size: z.string(),
    price: z.string(),
    buyOrderId: z.string(),
    sellOrderId: z.string(),
    commitment: z.string().regex(/^[a-f0-9]{64}$/),
    settlementMode: z.literal("not_submitted"),
    confidentiality_level: z.literal("operator_trusted"),
    simulated: z.literal(true),
  })
  .meta({ id: "PrivateRfqSettlement" });

export const PrivateRfqSubmissionSchema = z
  .object({
    status: z.enum(["resting", "matched"]),
    confidentiality_level: z.literal("operator_trusted"),
    simulated: z.literal(true),
    settlement: PrivateRfqSettlementSchema.optional(),
  })
  .meta({ id: "PrivateRfqSubmission" });

export const MatcherKeySchema = z
  .object({
    publicKey: z.string(),
    algorithm: z.literal("x25519-xsalsa20-poly1305"),
    confidentiality_level: z.literal("operator_trusted"),
    simulated: z.literal(true),
  })
  .meta({ id: "MatcherKey" });

export const PrivateRfqDisclosureSchema = z
  .object({
    settlementId: z.string(),
    commitment: z.string().regex(/^[a-f0-9]{64}$/),
    disclosure: PrivateRfqEncryptedOrderSchema,
    confidentiality_level: z.literal("operator_trusted"),
    simulated: z.literal(true),
  })
  .meta({ id: "PrivateRfqDisclosure" });
