// A suspended relationship: the API stops quoting, and the contract refuses a quote signed before.

import { ENDPOINTS } from "@pontis/api-types";
import { admin } from "../../../../scripts/lib/chain.ts";
import { parse, refusal } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import { balance, createUser, execute } from "../wallet.ts";
import type { World } from "../world.ts";
import { transaction } from "./settled.ts";

const quoteBody = (accountId: string) => ({
  fromId: "tgold-a",
  toId: "tgold-b",
  amountIn: "1000000",
  accountId,
});

export async function suspension(world: World): Promise<void> {
  const { api, config } = world;
  await step(
    "a suspended relationship stops quotes, and a quote signed before it is refused on chain",
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
          { "idempotency-key": `e2e-${Date.now()}-suspend` },
        ),
        ENDPOINTS.createConversion.response,
        201,
      );
      const pair = { representation_a_id: "tgold-a", representation_b_id: "tgold-b" };
      await admin(world.chain, config.coreId, "suspend_compatibility", {
        ...pair,
        rationale: "end-to-end test",
      });
      try {
        // The registry sync picks the suspension up within a couple of seconds.
        const code = await waitFor(
          "the API to refuse quotes for the suspended pair",
          async () => {
            const reply = await api.post("/v1/quotes", quoteBody(user.accountId));
            return reply.status === 422 && refusal(reply, 422);
          },
          { timeoutMs: 30_000, intervalMs: 1_000 },
        );
        assert.equal(code, "RELATIONSHIP_SUSPENDED");

        const held = await balance(world, config.tokenAId, user.accountId);
        await execute(user, plan.actions);
        await waitFor(
          "the failure to be indexed",
          async () => (await transaction(world, plan.conversionId)).state === "FAILED",
          { timeoutMs: 90_000 },
        );
        const tx = await transaction(world, plan.conversionId);
        assert.match(tx.failureReason ?? "", /RELATIONSHIP_SUSPENDED|COMPATIBILITY_CHANGED/);
        assert.equal(
          await balance(world, config.tokenAId, user.accountId),
          held,
          "the input was refunded",
        );
      } finally {
        await admin(world.chain, config.coreId, "approve_compatibility", {
          ...pair,
          rationale: "end-to-end test: restored",
        });
      }
      await waitFor(
        "quotes to work again after re-approval",
        async () => (await api.post("/v1/quotes", quoteBody(user.accountId))).status === 201,
        { timeoutMs: 30_000 },
      );
    },
  );
}
