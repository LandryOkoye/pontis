// POST /v1/conversions (BuildPlan B11): accept a quote, once, and hand back the unsigned wallet
// plan. The Idempotency-Key makes a repeated request return the original plan; a second key for
// an already accepted quote is a conflict. Acceptance and the conversion row are one transaction.

import type { CreateConversionResponse } from "@pontis/api-types";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { assetRepresentations, conversions, quotes } from "../db/schema/index.ts";
import { existingFor, openQuote } from "./accept-checks.ts";
import { AppError } from "../errors.ts";
import type { ConversionChain } from "./chain.ts";
import { buildWalletPlan } from "./plan.ts";

export interface AcceptDeps {
  db: Db;
  chain: ConversionChain;
  coreId: string;
  now?: () => Date;
}

const PG_UNIQUE_VIOLATION = "23505";

export async function acceptQuote(
  deps: AcceptDeps,
  quoteId: string,
  key: string,
): Promise<CreateConversionResponse> {
  const { db } = deps;
  const replay = await existingFor(db, key, quoteId);
  if (replay) return replay;
  const quote = await openQuote(db, (deps.now ?? (() => new Date()))(), quoteId);

  const reps = await db
    .select({ id: assetRepresentations.id, accountId: assetRepresentations.accountId })
    .from(assetRepresentations)
    .where(inArray(assetRepresentations.id, [quote.fromId, quote.toId]));
  const tokenOf = (id: string): string => {
    const account = reps.find((r) => r.id === id)?.accountId;
    if (!account) throw new Error(`asset ${id} vanished from the mirror`);
    return account;
  };
  const [tokenIn, tokenOut] = [tokenOf(quote.fromId), tokenOf(quote.toId)];
  const actions = buildWalletPlan({
    quote,
    tokenIn,
    tokenOut,
    coreId: deps.coreId,
    userRegisteredOnTokenOut: await deps.chain.isRegistered(tokenOut, quote.accountId),
  });

  try {
    return await db.transaction(async (tx) => {
      const accepted = await tx
        .update(quotes)
        .set({ state: "ACCEPTED", updatedAt: new Date() })
        .where(and(eq(quotes.id, quoteId), eq(quotes.state, "QUOTED")))
        .returning({ id: quotes.id });
      if (accepted.length === 0)
        throw new AppError("QUOTE_ALREADY_USED", 409, "The quote was already accepted");
      const [conversion] = await tx
        .insert(conversions)
        .values({ quoteId, idempotencyKey: key, plan: actions })
        .returning({ id: conversions.id });
      if (!conversion) throw new Error("conversion insert returned no row");
      return { conversionId: conversion.id, quoteId, actions };
    });
  } catch (error) {
    // A concurrent request with the same key may have won the race (it either holds the quote
    // already, or already inserted the conversion): answer with its result.
    const code = (error as { cause?: { code?: string } }).cause?.code;
    const lostRace =
      (error instanceof AppError && error.code === "QUOTE_ALREADY_USED") ||
      code === PG_UNIQUE_VIOLATION;
    const winner = lostRace ? await existingFor(db, key, quoteId) : undefined;
    if (winner) return winner;
    throw error;
  }
}
