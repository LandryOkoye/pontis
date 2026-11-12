// Phase 4, reserves half (ADR 0020 sections 2 to 6), through the real contract, indexer and API:
// the simulated custodian is set up with the same code `scripts reserves` runs, attests, the mint
// gate admits a mint inside the headroom and refuses one above it, and a drift below supply
// restricts the route until the custodian attests again. Every figure is SIMULATED.

import { ENDPOINTS } from "@pontis/api-types";
import { admin } from "../../../../scripts/lib/chain.ts";
import { backofficeChain } from "../../../../scripts/backoffice.ts";
import { parseReservesArgs } from "../../../../scripts/lib/reserve-ops.ts";
import { publishOnce, run } from "../../../../scripts/reserves.ts";
import { parse } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import { createUser } from "../wallet.ts";
import type { World } from "../world.ts";
import {
  ATTESTER_ACCOUNT,
  CUSTODIAN,
  REP,
  mirror,
  refused,
  reserves,
  view,
  type CustodyKit,
} from "./custody-kit.ts";

/** A policy tolerance of 1 percent and five minutes of freshness: short enough to read in a run. */
const TOLERANCE_BPS = 100;
const MAX_AGE_MS = 300_000;

export async function reservesScenario(world: World): Promise<CustodyKit> {
  const { api, chain, config } = world;
  const command = (...argv: string[]) => run(chain, parseReservesArgs(argv));
  const lastAsOf = new Map<string, number>();
  const publish = (coverBps = 10_000) =>
    publishOnce(chain, chain, { coverBps, custodianId: null }, lastAsOf);
  // The back-office is the token account of the issuer: it is in the issuer's `controlled_accounts`
  // and the deployer key is one of its keys (the runbook's second option).
  const office = backofficeChain(chain, {
    BACKOFFICE_ACCOUNT_ID: config.tokenAId,
    BACKOFFICE_PRIVATE_KEY: config.deployerKey,
  });
  const supply = async () => BigInt(await view<string>(world, config.tokenAId, "ft_total_supply"));

  const user = await createUser(world, { allowlisted: true, mintA: 10_000_000n });
  const quoteBody = {
    fromId: REP,
    toId: "tgold-b",
    amountIn: "1000000",
    accountId: user.accountId,
  };
  const quote = () => api.post("/v1/quotes", quoteBody);

  await step(
    "a custodian, its attester key, custody link and reserve policy are set up, and the core gates the mint",
    async () => {
      const attester = `${ATTESTER_ACCOUNT}.${config.deployerId}`;
      await command("grant-role", "reserve_attester", attester);
      await command("register-attester", attester, "--scopes", "reserves");
      await command(
        "register-custodian",
        CUSTODIAN,
        "--name",
        "Meridian Vault Co (SYNTHETIC)",
        "--jurisdiction",
        "CH",
      );
      await command("link", REP, "segregated", CUSTODIAN);
      await command(
        "set-policy",
        REP,
        "--action",
        "restrict_conversions",
        "--tolerance-bps",
        String(TOLERANCE_BPS),
        "--max-age-ms",
        String(MAX_AGE_MS),
        "--baseline-supply",
        (await supply()).toString(),
      );
      await command("set-minter", REP);
      // The owner's own mint path is closed while a minter is set.
      const before = await supply();
      assert.ok(
        await refused(() =>
          admin(chain, config.tokenAId, "mint", { account_id: user.accountId, amount: "1" }),
        ),
        "the owner mint must fail once the core is the minter",
      );
      assert.equal(await supply(), before);

      const custody = parse(
        await api.get(`/v1/assets/${REP}/custody`),
        ENDPOINTS.getAssetCustody.response,
      );
      assert.equal(custody.linked, true);
      assert.equal(custody.structure, "segregated");
      assert.deepEqual(
        custody.custodians.map((c) => [c.id, c.synthetic, c.simulated]),
        [[CUSTODIAN, true, true]],
      );
      const before0 = await reserves(world);
      assert.equal(before0.monitored, true);
      assert.equal(before0.state, "no_attestation", "nothing is attested yet");
      assert.equal(before0.restrictsConversions, true);
      // The mirror learns the custodian from events and then fills in its record from the chain.
      await waitFor(
        "the mirror to hold the custodian and the reserve policy",
        async () => {
          const rows = await mirror<{ n: string }>(
            world,
            `select (select count(*) from custodians where id = $1 and needs_refresh = false)
                  + (select count(*) from reserve_policies where representation_id = $2)
                  + (select count(*) from custody_links where representation_id = $2) as n`,
            [CUSTODIAN, REP],
          );
          return rows[0]?.n === "3";
        },
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
    },
  );

  await step(
    "the simulated custodian attests 110 percent cover: the API shows ratio and freshness, labelled simulated",
    async () => {
      await publish(11_000);
      const status = await waitFor(
        "the API to show the attestation",
        async () => {
          const r = await reserves(world);
          return r.state === "ok" && r;
        },
        { timeoutMs: 60_000 },
      );
      assert.ok(status.ratioBps !== null && status.ratioBps >= 10_999 && status.ratioBps <= 11_000);
      assert.equal(status.freshness, "fresh");
      assert.equal(status.restrictsConversions, false);
      assert.equal(status.simulated, true);
      assert.ok(status.sources.includes("simulated_custodian"), status.sources.join(","));
      assert.equal(status.policy?.toleranceBps, TOLERANCE_BPS);
      const line = status.custodians[0];
      assert.equal(line?.custodianId, CUSTODIAN);
      assert.equal(line?.counted, true);
      assert.equal(line?.latest?.simulated, true);
      assert.equal(line?.latest?.fresh, true);
      assert.equal(line?.latest?.source, "simulated_custodian");
      assert.equal(status.attestedUnits, line?.latest?.reservedUnits);

      const history = parse(
        await api.get(`/v1/assets/${REP}/reserves/history`),
        ENDPOINTS.getAssetReserveHistory.response,
      );
      assert.equal(history.items[0]?.reservedUnits, status.attestedUnits);
      const row = await waitFor(
        "the indexer to mirror the attestation",
        async () => {
          const rows = await mirror<{ reserved_units: string; simulated: boolean; source: string }>(
            world,
            `select reserved_units, simulated, source from reserve_attestations
              where representation_id = $1 order by seq desc limit 1`,
            [REP],
          );
          return rows[0];
        },
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
      assert.equal(row.reserved_units, status.attestedUnits);
      assert.equal(row.simulated, true);
      assert.equal(row.source, "simulated_custodian");
      await waitFor(
        "the mirror to show the state",
        async () =>
          (
            await mirror<{ state: string }>(
              world,
              "select state from reserve_status where representation_id = $1",
              [REP],
            )
          )[0]?.state === "ok",
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
    },
  );

  return { user, office, publish, command, quote };
}
