// Phase 4, redemption half 1 (ADR 0020 section 7): terms, a refused message, a user's `redeem:`
// transfer and the simulated back-office accepting and fulfilling it (the code `scripts backoffice`
// runs). NOTHING IS PAID OUT: a fulfilment burns the escrow.

import { ENDPOINTS } from "@pontis/api-types";
import { admin } from "../../../../scripts/lib/chain.ts";
import { parse } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import type { World } from "../world.ts";
import type { CustodyKit } from "./custody-kit.ts";
import { REP, freshReconciliation, mirror, untracked, view } from "./custody-kit.ts";
import { ACCEPT_WITHIN_MS, FULFIL, sha256, type Redemptions } from "./custody-redemption-kit.ts";

export async function redemptionScenario(
  world: World,
  kit: CustodyKit,
  r: Redemptions,
): Promise<void> {
  const { api, chain, config } = world;
  const { user } = kit;
  const { redemptionsOf, ledger, held, redeem, apiRedemption } = r;
  const { start, facts } = r;

  await step("redemption terms are set and the API shows their hash and window", async () => {
    await admin(chain, config.coreId, "set_redemption_terms", {
      representation_id: REP,
      terms: {
        min_amount: "1000000",
        max_amount: "0",
        fee_bps: 25,
        window_anchor_ms: 0,
        window_length_ms: 0,
        window_period_ms: 0,
        accept_within_ms: ACCEPT_WITHIN_MS,
        settlement_days: 1,
      },
    });
    const terms = parse(
      await api.get(`/v1/assets/${REP}/redemption-terms`),
      ENDPOINTS.getAssetRedemptionTerms.response,
    );
    assert.ok(terms.termsHash !== null && terms.terms !== null);
    facts.termsHash = terms.termsHash;
    assert.equal(terms.version, 1);
    assert.equal(terms.terms.acceptWithinMs, ACCEPT_WITHIN_MS);
    assert.equal(terms.terms.window.alwaysOpen, true);
    assert.equal(terms.simulated, true);
    const onChain = await view<{ terms_hash: string }>(
      world,
      config.coreId,
      "get_redemption_terms",
      {
        representation_id: REP,
      },
    );
    assert.equal(onChain.terms_hash, facts.termsHash);
    await waitFor(
      "the mirror to hold the terms",
      async () =>
        (
          await mirror<{ terms_hash: string }>(
            world,
            "select terms_hash from redemption_terms where representation_id = $1",
            [REP],
          )
        )[0]?.terms_hash === facts.termsHash,
      { timeoutMs: 60_000, intervalMs: 2_000 },
    );
    facts.untrackedBefore = untracked(await freshReconciliation(world));
  });

  await step(
    "a redeem message quoting other terms is refused and the tokens come back",
    async () => {
      const before = await held(user.accountId);
      await redeem(FULFIL, sha256("not the current terms"), sha256("SIMULATED payout instruction"));
      await waitFor("the refund", async () => (await held(user.accountId)) === before, {
        timeoutMs: 30_000,
      });
      assert.equal((await redemptionsOf()).length, 0, "no redemption was created");
      assert.equal((await ledger()).held, "0");
    },
  );

  const payout1 = sha256("SIMULATED payout instruction 1");
  await step("the user redeems with ft_transfer_call: the whole amount is escrowed", async () => {
    await redeem(FULFIL, facts.termsHash, payout1);
    const [first] = await waitFor(
      "the redemption to exist",
      async () => {
        const items = await redemptionsOf();
        return items.length === 1 && items;
      },
      { timeoutMs: 30_000 },
    );
    assert.ok(first);
    facts.id1 = first.id;
    assert.equal(first.status, "requested");
    assert.equal(first.amount, FULFIL.toString());
    // ceil(2_000_000 * 25 / 10_000) = 5_000, owed off-chain by the simulated issuer.
    assert.equal(first.fee_units, "5000");
    assert.equal(first.net_units, "1995000");
    assert.equal(await held(user.accountId), start.user - FULFIL);
    assert.equal(await held(config.coreId), start.core + FULFIL);
    const l = await ledger();
    assert.deepEqual(
      [l.escrowed_in, l.burned, l.returned, l.held, l.open_amount],
      [FULFIL.toString(), "0", "0", FULFIL.toString(), FULFIL.toString()],
    );
    const api1 = await apiRedemption(facts.id1);
    assert.equal(api1.status, "requested");
    assert.equal(api1.payoutInstructionHash, payout1);
    assert.equal(api1.simulated, true);
    assert.deepEqual(
      api1.timeline.map((e) => e.event),
      ["requested"],
    );
  });
}
