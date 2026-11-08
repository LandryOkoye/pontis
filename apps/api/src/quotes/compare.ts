// POST /v1/routes/compare: is a parity conversion between two assets available, and if not, why.
// Always an answer, never an error, for a pair of known assets.

import type { CompareRoutesRequest, CompareRoutesResponse } from "@pontis/api-types";
import { eq } from "drizzle-orm";
import type { Db } from "@pontis/db";
import { assetRepresentations } from "@pontis/db";
import { notFound } from "../errors.ts";
import type { QuoteChain } from "./chain.ts";
import { PARITY_EXPLANATION, explain, refusalCode } from "./reasons.ts";

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
    const inventory = BigInt(await chain.getInventory(req.toId));
    const wanted =
      (BigInt(req.amount) * BigInt(route.terms.ratio.num)) / BigInt(route.terms.ratio.den);
    if (inventory < wanted) {
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
