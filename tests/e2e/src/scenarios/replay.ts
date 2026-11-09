// Replaying a signed transfer: the contract refuses it, the input comes back, the settlement stays.

import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import { balance, execute } from "../wallet.ts";
import type { World } from "../world.ts";
import { transaction, type Settled } from "./settled.ts";

export async function replay(world: World, settled: Settled): Promise<void> {
  const { config } = world;
  await step(
    "replaying the signed transfer is refused on chain, refunded, and leaves the settlement alone",
    async () => {
      const heldA = await balance(world, config.tokenAId, settled.user.accountId);
      const transfer = settled.actions.filter((a) => a.methodName === "ft_transfer_call");
      await execute(settled.user, transfer);
      await waitFor(
        "the rejection to be indexed",
        async () =>
          (await transaction(world, settled.conversionId)).events.some(
            (e) => e.eventName === "conversion_rejected",
          ),
        { timeoutMs: 90_000 },
      );
      const tx = await transaction(world, settled.conversionId);
      const rejected = tx.events.find((e) => e.eventName === "conversion_rejected");
      assert.equal((rejected?.data as Record<string, unknown>).reason, "NONCE_USED");
      assert.equal(tx.state, "SETTLED");
      assert.equal(
        await balance(world, config.tokenAId, settled.user.accountId),
        heldA,
        "the replayed input came back",
      );
      assert.equal(
        await balance(world, config.tokenBId, settled.user.accountId),
        settled.received,
        "nothing was paid twice",
      );
    },
  );
}
