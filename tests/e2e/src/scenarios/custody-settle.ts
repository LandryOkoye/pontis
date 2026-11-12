// Phase 4, redemption settlement (ADR 0020 section 7): the simulated back-office accepts and fulfils
// the first redemption (the code `scripts backoffice` runs; NOTHING IS PAID OUT, the escrow is
// burned), and a second one, left alone, misses its accept deadline and expires. SIMULATED.

import { backofficeRound } from "../../../../scripts/backoffice.ts";
import { admin } from "../../../../scripts/lib/chain.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import type { World } from "../world.ts";
import { mirror, type CustodyKit } from "./custody-kit.ts";
import { FULFIL, RECLAIM, sha256, type Redemptions } from "./custody-redemption-kit.ts";

export async function settleScenario(world: World, kit: CustodyKit, r: Redemptions): Promise<void> {
  const { chain, config } = world;
  const { office, user } = kit;
  const { redemptionsOf, redemption, ledger, held, supply, redeem, apiRedemption } = r;
  const { backoffice, announced, start, facts } = r;

  await step(
    "the back-office accepts and fulfils it: the escrow is burned, nothing is paid",
    async () => {
      await waitFor(
        "the back-office to accept and fulfil",
        async () => {
          await backofficeRound(office, backoffice(), announced);
          const r = await redemption(facts.id1);
          return r.status === "fulfilled" && !r.settling && r;
        },
        { timeoutMs: 90_000, intervalMs: 2_000 },
      ).then((r) => assert.match(r.fulfilment_evidence_hash ?? "", /^[0-9a-f]{64}$/));
      const l = await ledger();
      assert.deepEqual(
        [l.escrowed_in, l.burned, l.returned, l.held, l.open_amount],
        [FULFIL.toString(), FULFIL.toString(), "0", "0", "0"],
      );
      assert.equal(await held(user.accountId), start.user - FULFIL, "the user got no tokens back");
      assert.equal(
        await held(config.coreId),
        start.core,
        "the core holds nothing more than before",
      );
      assert.equal(await supply(), start.supply - FULFIL, "the escrow was burned out of supply");
      const api1 = await apiRedemption(facts.id1);
      assert.equal(api1.status, "fulfilled");
      assert.deepEqual(
        api1.timeline.map((e) => e.event),
        ["requested", "accepted", "fulfilled"],
      );
      assert.equal(api1.reclaimable, false);
      assert.equal(api1.simulated, true);
      assert.match(api1.fulfilmentEvidenceHash ?? "", /^[0-9a-f]{64}$/);
      await waitFor(
        "the mirror to show it fulfilled",
        async () =>
          (
            await mirror<{ status: string }>(
              world,
              "select status from redemptions where id = $1",
              [facts.id1],
            )
          )[0]?.status === "fulfilled",
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
    },
  );

  await step(
    "a second redemption is left alone, misses its accept deadline and expires",
    async () => {
      await kit.publish();
      await redeem(RECLAIM, facts.termsHash, sha256("SIMULATED payout instruction 2"));
      const second = await waitFor(
        "the second redemption to exist",
        async () => (await redemptionsOf()).find((r) => r.id !== facts.id1),
        { timeoutMs: 30_000 },
      );
      facts.id2 = second.id;
      const ignoring = backoffice([facts.id2]);
      await backofficeRound(office, ignoring, announced);
      assert.equal(
        (await redemption(facts.id2)).status,
        "requested",
        "the back-office left it alone",
      );
      assert.equal((await ledger()).held, RECLAIM.toString());

      // Anyone may expire it once the contract's clock passes the deadline.
      await waitFor(
        "the accept deadline to pass and the redemption to expire",
        async () => {
          await backofficeRound(office, ignoring, announced);
          const r = await redemption(facts.id2);
          if (r.status === "expired") return r;
          if (Date.now() < second.accept_deadline_ms) return false;
          await admin(chain, config.coreId, "expire_redemption", { id: facts.id2 }).catch(
            () => undefined,
          );
          return false;
        },
        { timeoutMs: 120_000, intervalMs: 3_000 },
      ).then((r) => assert.equal(r.miss, "accept"));
      const api2 = await apiRedemption(facts.id2);
      assert.equal(api2.status, "expired");
      assert.equal(api2.miss, "accept");
      assert.equal(api2.reclaimable, true);
      assert.equal(
        (await ledger()).held,
        RECLAIM.toString(),
        "the escrow is still held until reclaimed",
      );
    },
  );
}
