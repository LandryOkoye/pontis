// Expiry: refused by the API when accepted late, and by the contract when sent late.

import { ENDPOINTS } from "@pontis/api-types";
import { parse, refusal } from "../api.ts";
import { delay, waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import { balance, createUser, execute } from "../wallet.ts";
import type { World } from "../world.ts";
import { transaction } from "./settled.ts";

const AMOUNT_IN = "1000000";
const quoteBody = (accountId: string) => ({
  fromId: "tgold-a",
  toId: "tgold-b",
  amountIn: AMOUNT_IN,
  accountId,
});

/** A quote accepted now and sent after it expired: the API and the contract both refuse it. */
export async function expiry(world: World): Promise<void> {
  const { api, config } = world;
  await step(
    "an expired quote is refused by the API, and one accepted in time but sent late is refused by the contract",
    async () => {
      const user = await createUser(world, { allowlisted: true, mintA: 5_000_000n });
      const quote = parse(
        await api.post("/v1/quotes", quoteBody(user.accountId)),
        ENDPOINTS.createQuote.response,
        201,
      );
      const plan = parse(
        await api.post(
          "/v1/conversions",
          { quoteId: quote.id },
          { "idempotency-key": `e2e-${Date.now()}-expiry` },
        ),
        ENDPOINTS.createConversion.response,
        201,
      );
      // A second quote nobody accepts: accepting it late is the plain expiry case.
      const unused = parse(
        await api.post("/v1/quotes", quoteBody(user.accountId)),
        ENDPOINTS.createQuote.response,
        201,
      );
      await delay(Math.max(0, Date.parse(quote.expiresAt) - Date.now()) + 2_000);
      const late = await api.post(
        "/v1/conversions",
        { quoteId: unused.id },
        { "idempotency-key": `e2e-${Date.now()}-expiry-2` },
      );
      assert.equal(refusal(late, 410), "QUOTE_EXPIRED");

      const held = await balance(world, config.tokenAId, user.accountId);
      await execute(user, plan.actions);
      await waitFor(
        "the on-chain rejection to be indexed",
        async () =>
          (await transaction(world, plan.conversionId)).events.some(
            (e) => e.eventName === "conversion_rejected",
          ),
        { timeoutMs: 90_000 },
      );
      const tx = await transaction(world, plan.conversionId);
      const rejected = tx.events.find((e) => e.eventName === "conversion_rejected");
      assert.equal((rejected?.data as Record<string, unknown>).reason, "QUOTE_EXPIRED");
      assert.equal(tx.state, "EXPIRED");
      assert.equal(
        await balance(world, config.tokenAId, user.accountId),
        held,
        "the input was refunded",
      );
    },
  );
}
