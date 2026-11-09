// Unsupported, unauthorized, suspended and expired conversions are refused by the API and, where
// the user could still send the transaction, by the contract.

import { refusal } from "../api.ts";
import { assert, section, step } from "../steps.ts";
import { createUser } from "../wallet.ts";
import type { World } from "../world.ts";

const AMOUNT_IN = "1000000";
const quoteBody = (accountId: string) => ({
  fromId: "tgold-a",
  toId: "tgold-b",
  amountIn: AMOUNT_IN,
  accountId,
});

export async function refusals(world: World): Promise<void> {
  section("Refusals");
  const { api } = world;

  await step("an account that is not allowlisted gets NOT_ELIGIBLE", async () => {
    const stranger = await createUser(world, { allowlisted: false, mintA: 5_000_000n });
    assert.equal(
      refusal(await api.post("/v1/quotes", quoteBody(stranger.accountId)), 422),
      "NOT_ELIGIBLE",
    );
  });

  await step(
    "a pair with no approved relationship, and a malformed amount, are refused",
    async () => {
      const user = await createUser(world, { allowlisted: true });
      const samePair = await api.post("/v1/quotes", {
        ...quoteBody(user.accountId),
        toId: "tgold-a",
      });
      assert.equal(refusal(samePair, 422), "NOT_DIRECT_EQUIVALENT");
      const malformed = await api.post("/v1/quotes", {
        ...quoteBody(user.accountId),
        amountIn: "1.5",
      });
      assert.equal(refusal(malformed, 400), "VALIDATION_ERROR");
    },
  );
}
