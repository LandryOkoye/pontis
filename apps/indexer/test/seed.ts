// Minimal rows the indexer tests need: two representations and quotes between them.

import type { Db } from "@pontis/db";
import { assetRepresentations, canonicalAssets, conversions, issuers, quotes } from "@pontis/db";
import type { QuoteState } from "@pontis/domain";
import { randomBytes } from "node:crypto";

const T0 = new Date("2026-11-07T18:00:00Z");
const record = {
  synthetic: true,
  verificationStatus: "unverified",
  status: "active",
  registeredBy: "x",
  registeredAt: T0,
} as const;
const prose = "text";

export async function seedRegistry(db: Db): Promise<void> {
  await db.insert(issuers).values({
    ...record,
    id: "iss",
    name: "Issuer",
    authorizedCategories: [],
    controlledAccounts: [],
  });
  await db.insert(canonicalAssets).values({
    ...record,
    id: "gold",
    name: "Gold",
    category: prose,
    claimDescription: prose,
    unitDefinition: prose,
    economicRights: prose,
    legalClaimStructure: prose,
    redemptionTerms: prose,
    eligibilityRestrictions: prose,
    riskDisclosures: [],
  });
  for (const id of ["a", "b"]) {
    await db.insert(assetRepresentations).values({
      ...record,
      id,
      canonicalAssetId: "gold",
      issuerId: "iss",
      accountId: `t${id}.testnet`,
      name: id,
      symbol: id,
      decimals: 6,
      unitMultiplierNum: "1",
      unitMultiplierDen: "1",
      adminCapabilities: [],
      custodyDescription: prose,
      redemptionMechanism: prose,
      transferPolicySummary: prose,
      bridgeStatus: "none",
      allowlistRequired: false,
      vaultInventory: "0",
    });
  }
}

export interface SeededQuote {
  nonce: string;
  quoteId: string;
  conversionId: string | undefined;
}

/** A quote of 1 A for 0.999 B in `state`, with a conversion row unless it was never accepted. */
export async function seedQuote(
  db: Db,
  state: QuoteState,
  txHash: string | null = null,
): Promise<SeededQuote> {
  const nonce = randomBytes(16).toString("hex");
  const [quote] = await db
    .insert(quotes)
    .values({
      accountId: "alice.testnet",
      fromId: "a",
      toId: "b",
      amountIn: "1000000",
      amountOutGross: "1000000",
      fee: "1000",
      amountOut: "999000",
      ratioNum: "1",
      ratioDen: "1",
      feeBps: 10,
      nonce,
      signature: "sig",
      expiresAt: new Date(T0.getTime() + 60_000),
      compatibilityVersion: 1,
      policyVersion: 1,
      route: {},
      warnings: [],
      state,
    })
    .returning({ id: quotes.id });
  if (!quote) throw new Error("quote not inserted");
  if (state === "QUOTED" || state === "EXPIRED") {
    return { nonce, quoteId: quote.id, conversionId: undefined };
  }
  const [conversion] = await db
    .insert(conversions)
    .values({ quoteId: quote.id, idempotencyKey: `key-${nonce}`, txHash })
    .returning({ id: conversions.id });
  return { nonce, quoteId: quote.id, conversionId: conversion?.id };
}
