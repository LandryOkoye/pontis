// POST /v1/routes/compare: is a parity conversion between two assets available, and if not, why.
// Always an answer, never an error, for a pair of known assets.

import type { CompareRoutesRequest, CompareRoutesResponse } from "@pontis/api-types";
import { eq } from "drizzle-orm";
import type { Db } from "@pontis/db";
import { assetRepresentations } from "@pontis/db";
import { notFound } from "../errors.ts";
import type { QuoteChain } from "./chain.ts";
import { payoutAmounts, vaultCovers } from "./payout.ts";
import { PARITY_EXPLANATION, explain, guardRefusal, refusalCode } from "./reasons.ts";

export async function assertAssetsExist(db: Db, ids: string[]): Promise<void> {
  for (const id of ids) {
    const [row] = await db
      .select({ id: assetRepresentations.id })
      .from(assetRepresentations)
      .where(eq(assetRepresentations.id, id));
    if (!row) throw notFound(`Asset ${id}`);
  }
}

export async function compareRoutes(
  db: Db,
  chain: QuoteChain,
  req: CompareRoutesRequest,
): Promise<CompareRoutesResponse> {
  await assertAssetsExist(db, [req.fromId, req.toId]);
  const route = await chain.getRoute(req.fromId, req.toId);
  const type = "PARITY_CONVERSION" as const;
  if (!route.executable || !route.terms) {
    const refusal = route.refusal ?? "no_relationship";
    const code = refusalCode(refusal);
    return {
      routes: [
        {
          type,
          executable: false,
          ...(code === "NOT_FOUND" ? {} : { reasonCode: code }),
          explanation: explain(refusal),
        },
      ],
    };
  }
  const base = {
    type,
    ratio: route.terms.ratio,
    compatibilityVersion: route.terms.compatibility_version,
  };
  if (req.amount !== undefined) {
    // The same guards, fee and inventory rule as `createQuote`.
    const guards = await chain.getRouteGuards(req.fromId, req.toId, req.amount);
    const refusal = guardRefusal(guards.checks);
    if (refusal) {
      return {
        routes: [
          { ...base, executable: false, reasonCode: refusal.code, explanation: refusal.message },
        ],
      };
    }
    const amounts = payoutAmounts(
      BigInt(req.amount),
      route.terms.ratio,
      guards.fee_bps ?? (await chain.getFeeBps()),
    );
    if (!(await vaultCovers(chain, req.toId, amounts))) {
      return {
        routes: [
          {
            ...base,
            executable: false,
            reasonCode: "INSUFFICIENT_INVENTORY",
            explanation:
              "The test vault does not hold enough of the destination asset for this amount.",
          },
        ],
      };
    }
  }
  return { routes: [{ ...base, executable: true, explanation: PARITY_EXPLANATION }] };
}
