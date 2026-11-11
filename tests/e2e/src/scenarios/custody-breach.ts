// Phase 4, breach half (ADR 0020 sections 5 and 8): the simulated custodian drifts below supply, the
// route is restricted and says why in every surface, the reconciler reports a breach only when the
// mirror missed it, and a fresh attestation reopens the route. Every figure is SIMULATED.

import { ENDPOINTS } from "@pontis/api-types";
import { publishOnce as publishPrices } from "../../../../scripts/guards.ts";
import { parse, refusal } from "../api.ts";
import { waitFor } from "../processes.ts";
import { assert, step } from "../steps.ts";
import type { World } from "../world.ts";
import { REP, freshReconciliation, mirror, reserves, type CustodyKit } from "./custody-kit.ts";

export async function breachScenario(world: World, kit: CustodyKit): Promise<void> {
  const { api, chain } = world;
  const { command, publish, quote } = kit;

  await step(
    "a drift below supply breaches the reserve: quotes are refused, the guard check fails, the mirror agrees",
    async () => {
      await command("drift", REP, "9000");
      await publish();
      const status = await waitFor(
        "the API to show the breach",
        async () => {
          const r = await reserves(world);
          return r.state === "breached" && r;
        },
        { timeoutMs: 60_000 },
      );
      assert.equal(status.restrictsConversions, true);
      assert.equal(status.mintPaused, false, "restrict_conversions does not pause the mint");
      assert.ok(status.ratioBps !== null && status.ratioBps < 10_000);

      const code = await waitFor(
        "quotes to be refused",
        async () => {
          const reply = await quote();
          return reply.status === 422 && refusal(reply, 422);
        },
        { timeoutMs: 30_000, intervalMs: 1_000 },
      );
      assert.equal(code, "RESERVE_RESTRICTED");

      const guards = parse(
        await api.get(`/v1/routes/${REP}/tgold-b/guards?amount=1000000`),
        ENDPOINTS.getRouteGuards.response,
      );
      assert.equal(guards.executable, false);
      const check = guards.checks.find((c) => c.name === "reserves");
      assert.ok(check, `no reserves check in ${guards.checks.map((c) => c.name).join(",")}`);
      assert.equal(check.passed, false);
      assert.equal(check.reasonCode, "RESERVE_RESTRICTED");

      await waitFor(
        "the mirror to record the breach",
        async () =>
          (
            await mirror<{ state: string }>(
              world,
              "select state from reserve_status where representation_id = $1",
              [REP],
            )
          )[0]?.state === "breached",
        { timeoutMs: 60_000, intervalMs: 2_000 },
      );
      // A breach the mirror recorded is not a reconciler finding (ADR 0020 section 8): two runs.
      await freshReconciliation(world);
      const run = await freshReconciliation(world);
      assert.equal(
        run.findings.filter((f) => f.kind === "RESERVE_BREACH").length,
        0,
        "a recorded breach is not a finding",
      );
    },
  );

  await step(
    "a breach the mirror missed is reported as RESERVE_BREACH (the mirror is made to forget it)",
    async () => {
      // Simulates a missed event: the contract says `breached`, the mirror says `ok`.
      await world.pool.query(
        "update reserve_status set state = 'ok' where representation_id = $1",
        [REP],
      );
      try {
        const finding = await waitFor(
          "the reconciler to report the unrecorded breach",
          async () => {
            const r = parse(await world.api.admin(), ENDPOINTS.getReconciliation.response);
            return r.findings.find((f) => f.kind === "RESERVE_BREACH" && f.subject === REP);
          },
          { timeoutMs: 90_000, intervalMs: 2_000 },
        );
        assert.equal(finding.severity, "critical");
        assert.match(finding.message, /simulated reserves/);
      } finally {
        await world.pool.query(
          "update reserve_status set state = 'breached' where representation_id = $1",
          [REP],
        );
      }
    },
  );

  await step(
    "a fresh attestation at full cover reopens the route and clears the finding",
    async () => {
      await command("drift", REP, "clear");
      await publish();
      await waitFor(
        "the reserve to be ok again",
        async () => (await reserves(world)).state === "ok",
        { timeoutMs: 60_000 },
      );
      // The guarded pair also needs fresh prices (the guards scenario's relayer code).
      await publishPrices(chain);
      await waitFor("the route to reopen", async () => (await quote()).status === 201, {
        timeoutMs: 60_000,
        intervalMs: 2_000,
      });
      await waitFor(
        "the mirror to record the recovery",
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
      await waitFor(
        "the reserve finding to clear",
        async () => {
          const r = await freshReconciliation(world);
          return !r.findings.some((f) => f.kind === "RESERVE_BREACH");
        },
        { timeoutMs: 90_000, intervalMs: 1_000 },
      );
    },
  );
}
