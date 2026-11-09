// A submission that never reaches the chain: the reconciler flags it later.

import { ENDPOINTS } from "@pontis/api-types";
import { parse } from "../api.ts";
import { createUser } from "../wallet.ts";
import type { World } from "../world.ts";

/** A quote accepted and reported as submitted with a hash that never reached the chain. */
export async function stuckSubmission(world: World): Promise<string> {
  const user = await createUser(world, { allowlisted: true });
  const quote = parse(
    await world.api.post("/v1/quotes", {
      fromId: "tgold-a",
      toId: "tgold-b",
      amountIn: "1000000",
      accountId: user.accountId,
    }),
    ENDPOINTS.createQuote.response,
    201,
  );
  const plan = parse(
    await world.api.post(
      "/v1/conversions",
      { quoteId: quote.id },
      { "idempotency-key": `e2e-${Date.now()}-stuck` },
    ),
    ENDPOINTS.createConversion.response,
    201,
  );
  parse(
    await world.api.post(`/v1/conversions/${plan.conversionId}/submitted`, {
      txHash: "1".repeat(44),
    }),
    ENDPOINTS.markConversionSubmitted.response,
  );
  return plan.conversionId;
}
