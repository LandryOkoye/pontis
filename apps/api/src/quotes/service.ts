// Quote flow (BuildPlan B10): compatibility, eligibility, inventory, compute, sign, persist.
// Each refusal is a 422 with a reason code. The contract re-checks everything at execution, so a
// quote is a signed offer bound to versions, not a reservation.

import type { CreateQuoteRequest, Quote, RouteDescriptor } from "@pontis/api-types";
import { newNonce, signQuote, type QuoteKey } from "@pontis/quote-engine";
import { inArray } from "drizzle-orm";
import type { Db } from "@pontis/db";
import { assetRepresentations, quotes } from "@pontis/db";
import { AppError, notFound } from "../errors.ts";
import type { QuoteChain } from "./chain.ts";
import { assertAssetsExist } from "./compare.ts";
import { quoteFromRow } from "./quote-mapper.ts";
import { payoutAmounts, vaultCovers } from "./payout.ts";
import { explain, guardRefusal, refusalCode } from "./reasons.ts";

export const QUOTE_TTL_MS = 60_000;

export interface QuoteDeps {
  db: Db;
  chain: QuoteChain;
  key: QuoteKey;
  /** The pontis-core account the quote is bound to. */
  coreId: string;
  now?: () => Date;
}

const ROUTE: RouteDescriptor = {
  type: "PARITY_CONVERSION",
  venue: "CONTROLLED_TEST_VAULT",
  network: "near-testnet",
  settlement: "ASYNC_CALLBACK_WITH_REFUND",
  description:
    "Controlled test vault, same chain. Settled asynchronously across several receipts with a refund if the payout fails; not an atomic transaction.",
};

const WARNINGS = [
  { code: "SYNTHETIC", message: "Synthetic, unbacked test assets. Testnet only; no real value." },
  {
    code: "NETWORK_COST",
    message: "Network fees are paid by your wallet and are not part of this quote.",
  },
];

const refuse = (code: AppError["code"], message: string) => new AppError(code, 422, message);

export async function createQuote(deps: QuoteDeps, req: CreateQuoteRequest): Promise<Quote> {
  const { db, chain } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const amountIn = BigInt(req.amountIn);
  if (amountIn === 0n)
    throw new AppError("VALIDATION_ERROR", 400, "amountIn must be greater than zero");
  await assertAssetsExist(db, [req.fromId, req.toId]);

  const route = await chain.getRoute(req.fromId, req.toId);
  if (!route.executable || !route.terms) {
    const refusal = route.refusal ?? "no_relationship";
    const code = refusalCode(refusal);
    throw code === "NOT_FOUND" ? notFound("Asset") : refuse(code, explain(refusal));
  }
  for (const id of [req.fromId, req.toId]) {
    if (!(await chain.isAllowed(id, req.accountId))) {
      throw refuse("NOT_ELIGIBLE", `${req.accountId} is not on the allowlist for ${id}.`);
    }
  }
  // The contract's own verdict on this amount: limits, prices and the fee it will charge, skew
  // included. A quote copies that fee, so execution cannot disagree with it (FEE_CHANGED).
  const guards = await chain.getRouteGuards(req.fromId, req.toId, amountIn.toString());
  const refusal = guardRefusal(guards.checks);
  if (refusal) throw refuse(refusal.code, refusal.message);
  const feeBps = guards.fee_bps ?? (await chain.getFeeBps());
  const amounts = payoutAmounts(amountIn, route.terms.ratio, feeBps);
  if (!(await vaultCovers(chain, req.toId, amounts))) {
    throw refuse(
      "INSUFFICIENT_INVENTORY",
      "The test vault does not hold enough of the destination asset.",
    );
  }

  const reps = await db
    .select({ id: assetRepresentations.id, accountId: assetRepresentations.accountId })
    .from(assetRepresentations)
    .where(inArray(assetRepresentations.id, [req.fromId, req.toId]));
  const tokenOf = (id: string): string => {
    const account = reps.find((r) => r.id === id)?.accountId;
    if (!account) throw new Error(`asset ${id} vanished from the mirror`);
    return account;
  };
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS);
  const fields = {
    version: 1,
    contract: deps.coreId,
    user: req.accountId,
    tokenIn: tokenOf(req.fromId),
    tokenOut: tokenOf(req.toId),
    amountIn,
    amountOutGross: amounts.gross,
    fee: amounts.fee,
    amountOut: amounts.net,
    feeBps,
    expiresAtMs: expiresAt.getTime(),
    nonce: newNonce(),
    compatibilityVersion: route.terms.compatibility_version,
    policyVersion: route.terms.policy_version,
  };
  const signed = signQuote(deps.key, fields);
  const [row] = await db
    .insert(quotes)
    .values({
      accountId: req.accountId,
      fromId: req.fromId,
      toId: req.toId,
      amountIn: amountIn.toString(),
      amountOutGross: amounts.gross.toString(),
      fee: amounts.fee.toString(),
      amountOut: amounts.net.toString(),
      ratioNum: route.terms.ratio.num,
      ratioDen: route.terms.ratio.den,
      feeBps,
      nonce: fields.nonce,
      signature: signed.signatureBase64,
      expiresAt,
      compatibilityVersion: fields.compatibilityVersion,
      policyVersion: fields.policyVersion,
      route: ROUTE,
      warnings: WARNINGS,
      state: "QUOTED",
    })
    .returning();
  if (!row) throw new Error("quote insert returned no row");
  return quoteFromRow(row);
}
