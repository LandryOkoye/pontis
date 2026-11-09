// The reconciler: quiet after normal conversions, loud about a direct transfer and a stuck submission.

import { ENDPOINTS } from "@pontis/api-types";
import { parse, refusal } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, section, step } from "../steps.ts";
import { balance, type User } from "../wallet.ts";
import type { World } from "../world.ts";
import type { Settled } from "./settled.ts";

const report = async (world: World) =>
  parse(await world.api.admin(), ENDPOINTS.getReconciliation.response);

export async function reconciliation(
  world: World,
  settled: Settled,
  stuckConversionId: string,
): Promise<void> {
  section("Reconciliation");
  const { api, config } = world;

  await step("the admin endpoint needs the key", async () => {
    assert.equal(refusal(await api.get("/v1/admin/reconciliation"), 401), "UNAUTHORIZED");
    assert.equal(refusal(await api.admin("not-the-key-not-the-key"), 401), "UNAUTHORIZED");
  });

  await step(
    "vault inventory equals the tokens the core holds for both representations",
    async () => {
      const run = await waitFor(
        "a reconciler run",
        async () => {
          const r = await report(world);
          return r.ranAt !== null && r.vaults.length === 2 && r;
        },
        { timeoutMs: 60_000 },
      );
      for (const vault of run.vaults)
        assert.equal(vault.inventory, vault.balance, vault.representationId);
      assert.deepEqual(run.vaults.map((v) => v.representationId).sort(), ["tgold-a", "tgold-b"]);
    },
  );

  await step(
    "a token sent to the core outside ft_transfer_call is reported as an untracked balance",
    async () => {
      const holder: User = settled.user;
      const held = await balance(world, config.tokenAId, holder.accountId);
      assert.ok(held > 1_234n, "the user still holds TGOLD-A");
      await holder.wallet.callFunctionRaw({
        contractId: config.tokenAId,
        methodName: "ft_transfer",
        args: { receiver_id: config.coreId, amount: "1234" },
        gas: 30_000_000_000_000n,
        deposit: 1n,
        waitUntil: "FINAL",
      });
      const run = await waitFor(
        "the untracked balance to be reported",
        async () => {
          const r = await report(world);
          return (
            r.findings.some(
              (f) => f.kind === "VAULT_UNTRACKED_BALANCE" && f.subject === "tgold-a",
            ) && r
          );
        },
        { timeoutMs: 90_000 },
      );
      const vault = run.vaults.find((v) => v.representationId === "tgold-a");
      assert.equal(BigInt(vault?.balance ?? "0") - BigInt(vault?.inventory ?? "0"), 1_234n);
    },
  );

  await step("a submission with no outcome is flagged and listed for a person", async () => {
    const run = await waitFor(
      "the stuck submission to be flagged",
      async () => {
        const r = await report(world);
        return r.requiresReconciliation.some((q) => q.conversionId === stuckConversionId) && r;
      },
      { timeoutMs: 180_000, intervalMs: 3_000 },
    );
    assert.ok(run.findings.some((f) => f.kind === "STUCK_SUBMITTED"));
    assert.equal(run.status, "ATTENTION");
  });
}
