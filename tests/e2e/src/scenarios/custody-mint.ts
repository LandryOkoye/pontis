// Phase 4, mint gate (ADR 0020 section 6): the issuer's account mints inside the attested headroom
// and a mint above it is refused without changing anything. SIMULATED reserves and issuer.

import { admin } from "../../../../scripts/lib/chain.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import { balance } from "../wallet.ts";
import type { World } from "../world.ts";
import { REP, mirror, refused, view, type CustodyKit } from "./custody-kit.ts";

interface Headroom {
  headroom_units: string;
  circulating_units: string;
  attested_units: string;
  state: string;
}
interface MintRequest {
  status: string;
}

export async function mintScenario(world: World, kit: CustodyKit): Promise<void> {
  const { config } = world;
  const { user, office } = kit;
  const supply = async () => BigInt(await view<string>(world, config.tokenAId, "ft_total_supply"));
  const headroom = () =>
    view<Headroom>(world, config.coreId, "get_mint_headroom", { representation_id: REP });
  const mintRequest = (id: number) =>
    view<MintRequest>(world, config.coreId, "get_mint_request", { id });

  await step(
    "a mint inside the headroom succeeds as the issuer; one above it is refused and changes nothing",
    async () => {
      const h = await headroom();
      const room = BigInt(h.headroom_units);
      const amount = room / 2n;
      assert.ok(amount > 0n, `no headroom to mint into (${h.headroom_units})`);
      const heldBefore = await balance(world, config.tokenAId, user.accountId);
      const supplyBefore = await supply();

      const id = Number(
        await admin(office, config.coreId, "request_mint", {
          representation_id: REP,
          recipient: user.accountId,
          amount: amount.toString(),
          reference: "e2e-subscription-1",
        }),
      );
      assert.ok(Number.isInteger(id) && id > 0, `request_mint returned ${String(id)}`);
      await admin(office, config.coreId, "execute_mint", { request_id: id });
      await waitFor(
        "the mint to resolve",
        async () => (await mintRequest(id)).status === "minted",
        {
          timeoutMs: 60_000,
        },
      );
      assert.equal(await balance(world, config.tokenAId, user.accountId), heldBefore + amount);
      assert.equal(await supply(), supplyBefore + amount);
      const after = await headroom();
      assert.equal(BigInt(after.headroom_units), room - amount);
      await waitFor(
        "the mirror to hold the mint request",
        async () =>
          (
            await mirror<{ status: string }>(
              world,
              "select status from mint_requests where id = $1",
              [id],
            )
          )[0]?.status === "minted",
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );

      // One unit above the remaining headroom: the request is accepted as an intent, the mint is not.
      const over = BigInt(after.headroom_units) + 1n;
      const overId = Number(
        await admin(office, config.coreId, "request_mint", {
          representation_id: REP,
          recipient: user.accountId,
          amount: over.toString(),
          reference: "e2e-above-headroom",
        }),
      );
      assert.ok(
        await refused(() => admin(office, config.coreId, "execute_mint", { request_id: overId })),
        "a mint above the headroom must be refused",
      );
      assert.equal((await mintRequest(overId)).status, "requested");
      assert.equal(await supply(), supplyBefore + amount);
      assert.equal(await balance(world, config.tokenAId, user.accountId), heldBefore + amount);
      assert.equal((await headroom()).headroom_units, after.headroom_units);
      await admin(office, config.coreId, "cancel_mint_request", { request_id: overId });
      assert.equal((await mintRequest(overId)).status, "cancelled");
    },
  );
}
