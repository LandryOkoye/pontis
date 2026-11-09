// History: a hash reported after settlement is kept, and the account's history lists the conversion.

import { ENDPOINTS } from "@pontis/api-types";
import { parse } from "../api.ts";
import { assert, step } from "../steps.ts";
import type { World } from "../world.ts";
import type { Settled } from "./settled.ts";

export async function history(world: World, settled: Settled): Promise<void> {
  const { api } = world;
  await step(
    "a hash reported after settlement is kept on the conversion and its events",
    async () => {
      const tx = parse(
        await api.post(`/v1/conversions/${settled.conversionId}/submitted`, {
          txHash: settled.txHash,
        }),
        ENDPOINTS.markConversionSubmitted.response,
      );
      assert.equal(tx.state, "SETTLED");
      assert.equal(tx.txHash, settled.txHash);
      assert.ok(tx.events.every((e) => e.txHash === settled.txHash));
      const history = parse(
        await api.get(`/v1/transactions?account=${settled.user.accountId}`),
        ENDPOINTS.listTransactions.response,
      ).items;
      assert.deepEqual(
        history.map((t) => t.id),
        [settled.conversionId],
      );
    },
  );
}
