// Phase 4, redemption half 2 (ADR 0020 section 7): a redemption left alone misses its accept
// deadline and expires, the user reclaims the escrow, and every token is accounted for in the
// ledger, the API, the mirror and the reconciler. SIMULATED: the issuer is a test account.

import { ENDPOINTS } from "@pontis/api-types";
import { parse } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import type { World } from "../world.ts";
import type { CustodyKit } from "./custody-kit.ts";
import { ISSUER, REP, freshReconciliation, mirror, untracked } from "./custody-kit.ts";
import { FULFIL, RECLAIM, type Redemptions } from "./custody-redemption-kit.ts";

export async function reclaimScenario(
  world: World,
  kit: CustodyKit,
  r: Redemptions,
): Promise<void> {
  const { api, config } = world;
  const { redemption, ledger, held, supply, apiRedemption } = r;
  const { start, facts } = r;
  const { user } = kit;

  await step(
    "the user reclaims it: the escrow returns and every token is accounted for",
    async () => {
      await waitFor(
        "the reclaim to settle",
        async () => {
          const r = await redemption(facts.id2);
          if (r.status === "reclaimed") return r;
          if (!r.settling) {
            await user.wallet
              .callFunctionRaw({
                contractId: config.coreId,
                methodName: "reclaim_redemption",
                args: { id: facts.id2 },
                gas: 100_000_000_000_000n,
                deposit: 1n,
                waitUntil: "FINAL",
              })
              .catch(() => undefined);
          }
          return false;
        },
        { timeoutMs: 60_000, intervalMs: 3_000 },
      );
      assert.equal(
        await held(user.accountId),
        start.user - FULFIL,
        "the reclaimed tokens are back",
      );
      assert.equal(await held(config.coreId), start.core);
      assert.equal(await supply(), start.supply - FULFIL);
      const l = await ledger();
      // tokens in = out + burned + returned, and nothing is left held.
      assert.deepEqual(
        [l.escrowed_in, l.burned, l.returned, l.held, l.open_amount],
        [(FULFIL + RECLAIM).toString(), FULFIL.toString(), RECLAIM.toString(), "0", "0"],
      );
      assert.equal(BigInt(l.escrowed_in), BigInt(l.burned) + BigInt(l.returned) + BigInt(l.held));
      const api2 = await apiRedemption(facts.id2);
      assert.equal(api2.status, "reclaimed");
      assert.deepEqual(
        api2.timeline.map((e) => e.event),
        ["requested", "expired", "reclaimed"],
      );
      assert.equal(api2.reclaimable, false);
    },
  );

  await step("the API, the mirror and the reliability record agree", async () => {
    await waitFor(
      "the mirror to hold both redemptions resolved",
      async () => {
        const rows = await mirror<{ id: string; status: string }>(
          world,
          "select id::text, status from redemptions where representation_id = $1 order by id",
          [REP],
        );
        return (
          rows.length === 2 && rows[0]?.status === "fulfilled" && rows[1]?.status === "reclaimed"
        );
      },
      { timeoutMs: 60_000, intervalMs: 2_000 },
    );
    const reliability = parse(
      await api.get(`/v1/issuers/${ISSUER}/reliability`),
      ENDPOINTS.getIssuerReliability.response,
    );
    assert.equal(reliability.simulated, true);
    assert.deepEqual(
      [
        reliability.requested,
        reliability.accepted,
        reliability.fulfilled,
        reliability.expired,
        reliability.acceptMisses,
        reliability.fulfilMisses,
        reliability.reclaimed,
      ],
      [2, 1, 1, 1, 1, 0, 1],
    );
    const list = parse(
      await api.get(`/v1/redemptions?user=${user.accountId}`),
      ENDPOINTS.listRedemptions.response,
    );
    assert.deepEqual(
      list.items.map((r) => [Number(r.id), r.status]),
      [
        [facts.id2, "reclaimed"],
        [facts.id1, "fulfilled"],
      ],
    );
  });

  await step("the reconciler finds no escrow mismatch and the vault is as it was", async () => {
    const run = await waitFor(
      "a reconciler run after the last redemption",
      async () => {
        const r = await freshReconciliation(world);
        return r.vaults.length > 0 && r;
      },
      { timeoutMs: 90_000 },
    );
    const bad = run.findings.filter((f) =>
      ["ESCROW_MISMATCH", "REDEMPTION_OVERDUE", "RESERVE_BREACH"].includes(f.kind),
    );
    assert.deepEqual(bad, []);
    // The vault check also reads the escrow books: what the core holds beyond them is exactly the
    // surplus an earlier scenario created on purpose, so redeeming and reclaiming moved nothing else.
    assert.equal(untracked(run), facts.untrackedBefore);
  });
}
