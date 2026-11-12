// Price guards end to end (ADR 0016): a guarded pair opens on fresh simulated prices, a quote copies
// the contract's fee, a deviating price closes the route with its own reason, and a recovered
// price opens it again. Uses the same relayer code the demo runs (`scripts guards`).

import { ENDPOINTS } from "@pontis/api-types";
import { publishOnce, run } from "../../../../scripts/guards.ts";
import { parse, refusal } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, section, step } from "../steps.ts";
import { balance, createUser, execute } from "../wallet.ts";
import type { World } from "../world.ts";
import { transaction } from "./settled.ts";

const AMOUNT_IN = 1_000_000n;

export async function guards(world: World): Promise<void> {
  section("Price guards");
  const { api, chain, config } = world;
  const user = await createUser(world, { allowlisted: true, mintA: 10_000_000n });
  const quoteBody = { fromId: "tgold-a", toId: "tgold-b", amountIn: AMOUNT_IN.toString() };
  const quote = () => api.post("/v1/quotes", { ...quoteBody, accountId: user.accountId });

  await step("a pair with a guard but no price yet is closed, and says so", async () => {
    await run(chain, { kind: "register-publisher" });
    await run(chain, { kind: "set-guard", fromId: "tgold-a", toId: "tgold-b" });
    const code = await waitFor(
      "the API to see the new guard",
      async () => {
        const reply = await quote();
        return reply.status === 422 && refusal(reply, 422);
      },
      { timeoutMs: 30_000, intervalMs: 1_000 },
    );
    assert.equal(code, "PRICE_UNAVAILABLE");
  });

  await step("fresh simulated prices open it; the breakdown labels them simulated", async () => {
    await publishOnce(chain);
    const open = parse(await quote(), ENDPOINTS.createQuote.response, 201);
    const view = parse(
      await api.get(`/v1/routes/tgold-a/tgold-b/guards?amount=${AMOUNT_IN}`),
      ENDPOINTS.getRouteGuards.response,
    );
    assert.equal(view.guarded, true);
    assert.equal(view.executable, true);
    assert.equal(open.feeBps, view.feeBps, "the quote copies the contract's fee for this amount");
    assert.ok(view.prices.length === 2 && view.prices.every((p) => p.simulated));
  });

  await step("a quoted conversion on the guarded pair settles at the quoted fee", async () => {
    await publishOnce(chain);
    const q = parse(await quote(), ENDPOINTS.createQuote.response, 201);
    const plan = parse(
      await api.post(
        "/v1/conversions",
        { quoteId: q.id },
        { "idempotency-key": `e2e-${Date.now()}-guarded` },
      ),
      ENDPOINTS.createConversion.response,
      201,
    );
    const before = await balance(world, config.tokenAId, user.accountId);
    await execute(user, plan.actions);
    await waitFor(
      "the guarded conversion to settle",
      async () => (await transaction(world, plan.conversionId)).state === "SETTLED",
      { timeoutMs: 90_000 },
    );
    assert.equal(await balance(world, config.tokenAId, user.accountId), before - AMOUNT_IN);
  });

  await step(
    "a price that deviates closes the route with PRICE_DEVIATION, and recovery reopens it",
    async () => {
      // tgold-a up 3 percent: above the 150 bps guard, below the 500 bps hard bound, so one
      // evaluation refuses without tripping the breaker (it needs three).
      await publishOnce(chain, (p) =>
        p.representationId === "tgold-a" ? { ...p, price: (p.price * 10_300n) / 10_000n } : p,
      );
      const code = await waitFor(
        "the route to refuse the deviation",
        async () => {
          const reply = await quote();
          return reply.status === 422 && refusal(reply, 422);
        },
        { timeoutMs: 30_000, intervalMs: 1_000 },
      );
      assert.equal(code, "PRICE_DEVIATION");
      await publishOnce(chain);
      await waitFor("the route to reopen", async () => (await quote()).status === 201, {
        timeoutMs: 30_000,
        intervalMs: 1_000,
      });
    },
  );
}
