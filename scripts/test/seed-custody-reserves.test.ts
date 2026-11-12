import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devKey } from "@pontis/dev-keys";
import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { loadCoverState } from "../lib/reserve-publish.ts";
import {
  needsAttestation,
  seedAttestations,
  skippedByPublisher,
} from "../lib/seed-custody-reserves.ts";
import { seedPolicies } from "../lib/seed-custody-policies.ts";
import { seedAttesterRole, seedCustodians, seedLinks } from "../lib/seed-custody-setup.ts";
import { DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

const { custodians, custody } = custodyFor("full");
const accountOf = (id: string) => tokenAccount(id, DEPLOYER);
const SUPPLY = 1_000_000_000_000n;
const supplies = Object.fromEntries(custody.map((c) => [accountOf(c.representationId), SUPPLY]));
const statePath = () => join(mkdtempSync(join(tmpdir(), "custody-seed-")), "state.json");

async function seeded() {
  const fake = fakeCustodyChain(supplies).withRegistrar();
  await seedAttesterRole(fake.chain);
  await seedCustodians(fake.chain, custodians);
  await seedLinks(fake.chain, custody);
  const options = { relayer: fake.chain, nowMs: fake.clock.now, statePath: statePath() };
  const run = async () => {
    await seedPolicies(fake.chain, custody, accountOf);
    await seedAttestations(fake.chain, custody, accountOf, { ...options, nowMs: fake.clock.now });
  };
  await run();
  return { fake, run, options };
}
const stateOf = (fake: ReturnType<typeof fakeCustodyChain>, story: string) =>
  custody.filter((c) => c.story === story).map((c) => fake.status(c.representationId).state);

describe("the reserve stories over a fake chain", () => {
  it("reach the state each story promises, and the stale one decays", async () => {
    const { fake } = await seeded();
    expect(stateOf(fake, "healthy").every((s) => s === "ok")).toBe(true);
    expect(stateOf(fake, "thin")).toEqual(["ok", "ok"]);
    expect(stateOf(fake, "breached")).toEqual(["breached"]);
    expect(stateOf(fake, "warn_only")).toEqual(["breached"]);
    expect(stateOf(fake, "pause_mint")).toEqual(["ok"]);
    expect(stateOf(fake, "stale")).toEqual(["ok"]);
    expect(stateOf(fake, "never_attested")).toEqual(["no_attestation"]);
    fake.clock.now += 6 * 60_000;
    expect(stateOf(fake, "stale")).toEqual(["stale"]);
    expect(stateOf(fake, "healthy").every((s) => s === "ok")).toBe(true);
  });

  it("signs with the dev reserve-attester key, labelled simulated, and skips never_attested", async () => {
    const { fake } = await seeded();
    const sent = fake.calls.filter((c) => c.method === "submit_reserve_attestation");
    expect(sent).toHaveLength(custody.length - 1);
    for (const s of sent) {
      expect(s.args.public_key).toBe(devKey("reserve-attester").publicKey);
      expect(s.args.attestation).toMatchObject({ simulated: true, source: "simulated_custodian" });
    }
  });

  it("changes nothing when repeated, and refreshes everything but the stale story after half a max age", async () => {
    const { fake, run } = await seeded();
    const before = fake.calls.length;
    await run();
    expect(fake.calls.length).toBe(before);
    fake.clock.now += 13 * 3_600_000;
    await run();
    const refreshed = fake.calls
      .slice(before)
      .filter((c) => c.method === "submit_reserve_attestation");
    expect(refreshed).toHaveLength(custody.length - 2);
    expect(
      refreshed.some(
        (c) => (c.args.attestation as { representation_id: string }).representation_id === "teur-m",
      ),
    ).toBe(false);
  });

  it("records the story's cover for a later publish, leaving never_attested out", async () => {
    const { options } = await seeded();
    const state = loadCoverState(options.statePath);
    expect(state["tgkg-d"]).toBe(9_200);
    expect(state["tgkg-a"]).toBe(10_500);
    expect(state["tmmfeur-c"]).toBeUndefined();
  });

  it("names the lapsed and never-attested stories for a publisher to skip", () => {
    expect(skippedByPublisher(custody).sort()).toEqual(["teur-m", "tmmfeur-c"]);
    expect(needsAttestation(custody[0]!, null, 0)).toBe(true);
  });
});
