// The happy path: quote, accept, sign, index, reconcile with the contract's events; then replay.

import { ENDPOINTS } from "@pontis/api-types";
import { computeAmounts } from "@pontis/quote-engine";
import { RATIO_A_TO_B } from "../../../../scripts/lib/seed-data.ts";
import { parse, refusal } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, section, step } from "../steps.ts";
import { balance, createUser, execute } from "../wallet.ts";
import type { World } from "../world.ts";
import { transaction, type Settled } from "./settled.ts";

const AMOUNT_IN = 1_000_000n;
const FEE_BPS = 10;

export async function conversion(world: World): Promise<Settled> {
  section("Conversion");
  const { api, config } = world;
  const user = await createUser(world, { allowlisted: true, mintA: 5_000_000n });
  const key = `e2e-${Date.now()}-happy`;
  const expected = computeAmounts(AMOUNT_IN, RATIO_A_TO_B, FEE_BPS);
  assert.ok(expected, "the expected output is computed independently, with bigint");

  const quote = await step(
    "a quote carries the ratio, fee, output and expiry the shared math gives",
    async () => {
      const q = parse(
        await api.post("/v1/quotes", {
          fromId: "tgold-a",
          toId: "tgold-b",
          amountIn: AMOUNT_IN.toString(),
          accountId: user.accountId,
        }),
        ENDPOINTS.createQuote.response,
        201,
      );
      assert.equal(q.amountOutGross, expected.gross.toString());
      assert.equal(q.fee, expected.fee.toString());
      assert.equal(q.amountOut, expected.net.toString());
      assert.equal(q.state, "QUOTED");
      assert.ok(Date.parse(q.expiresAt) > Date.now(), "the quote has not expired");
      return q;
    },
  );

  const plan = await step(
    "accepting returns unsigned actions, the same ones for the same key, and refuses a second key",
    async () => {
      const accept = () =>
        api.post("/v1/conversions", { quoteId: quote.id }, { "idempotency-key": key });
      const first = parse(await accept(), ENDPOINTS.createConversion.response, 201);
      // The user holds no TGOLD-B yet, so the plan registers them first.
      assert.deepEqual(
        first.actions.map((a) => a.methodName),
        ["storage_deposit", "ft_transfer_call"],
      );
      assert.deepEqual(parse(await accept(), ENDPOINTS.createConversion.response, 201), first);
      const second = await api.post(
        "/v1/conversions",
        { quoteId: quote.id },
        { "idempotency-key": `${key}-other` },
      );
      assert.equal(refusal(second, 409), "QUOTE_ALREADY_USED");
      return first;
    },
  );

  const before = await balance(world, config.tokenAId, user.accountId);
  const txHash = await step(
    "the wallet signs and sends the actions; the indexer settles the quote",
    async () => {
      const hash = await execute(user, plan.actions);
      await waitFor(
        "the conversion to settle",
        async () => (await transaction(world, plan.conversionId)).state === "SETTLED",
        { timeoutMs: 90_000 },
      );
      return hash;
    },
  );

  await step(
    "balances moved by exactly the quoted amounts and the events match the quote",
    async () => {
      assert.equal(await balance(world, config.tokenAId, user.accountId), before - AMOUNT_IN);
      assert.equal(await balance(world, config.tokenBId, user.accountId), expected.net);
      const tx = await transaction(world, plan.conversionId);
      const completed = tx.events.find((e) => e.eventName === "conversion_completed");
      assert.ok(completed, "a conversion_completed event is attached");
      assert.deepEqual(
        {
          in: (completed.data as Record<string, unknown>).amount_in,
          out: (completed.data as Record<string, unknown>).amount_out,
        },
        { in: AMOUNT_IN.toString(), out: expected.net.toString() },
      );
    },
  );

  return {
    user,
    conversionId: plan.conversionId,
    actions: plan.actions,
    txHash,
    received: expected.net,
  };
}
