import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import type { CatalogueTier } from "../lib/catalogue-tiers.ts";
import { seedCustody } from "../lib/seed-custody.ts";
import { CORE, DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

function setup(tier: CatalogueTier) {
  const data = custodyFor(tier);
  const ids = new Set(
    [...data.custody, ...data.terms, ...data.redemptions].map((r) => r.representationId),
  );
  const supplies = Object.fromEntries(
    [...ids].map((id) => [tokenAccount(id, DEPLOYER), 10_000_000_000n]),
  );
  const fake = fakeCustodyChain(supplies);
  const funded: unknown[][] = [];
  const run = () =>
    seedCustody(fake.chain, {
      tier,
      relayer: fake.chain,
      officeFor: fake.as,
      nowMs: fake.clock.now,
      statePath: join(mkdtempSync(join(tmpdir(), "custody-seed-")), "state.json"),
      fund: async (_chain, payloads) => void funded.push([...payloads]),
    });
  return { fake, data, run, funded };
}

describe("seedCustody over a fake chain", () => {
  it("seeds nothing for the mvp tier: the end-to-end suite must not change", async () => {
    const { fake, run } = setup("mvp");
    await run();
    expect(fake.calls).toEqual([]);
  });

  it("seeds the demo tier in order and leaves each story where it belongs", async () => {
    const { fake, data, run, funded } = setup("demo");
    await run();
    const order = fake.methods();
    const first = (m: string) => order.indexOf(m);
    expect(first("grant_role")).toBeLessThan(first("add_signer_key"));
    expect(first("add_signer_key")).toBeLessThan(first("register_custodian"));
    expect(first("register_custodian")).toBeLessThan(first("link_custody"));
    expect(first("link_custody")).toBeLessThan(first("set_reserve_policy"));
    expect(first("set_reserve_policy")).toBeLessThan(first("submit_reserve_attestation"));
    expect(first("set_minter")).toBeLessThan(first("fulfil_redemption"));
    expect(funded).toHaveLength(1);
    const states = Object.fromEntries(
      data.custody.map((c) => [c.representationId, fake.status(c.representationId).state]),
    );
    expect(states).toMatchObject({ "tgkg-d": "breached", "teur-m": "ok", "ttb3m-m": "ok" });
    expect(fake.redemptions.map((r) => r.status).sort()).toEqual([
      "accepted",
      "fulfilled",
      "requested",
    ]);
  });

  it("keeps the registrar and the attester apart: the deployer never holds reserve_attester", async () => {
    const { fake, run } = setup("full");
    await run();
    expect(fake.roles.get("registrar")?.has(DEPLOYER)).toBe(true);
    expect(fake.roles.get("reserve_attester")).toEqual(new Set([`custodian-sim.${DEPLOYER}`]));
    for (const c of fake.calls)
      expect(c.contract === CORE || c.contract.endsWith(`.${DEPLOYER}`)).toBe(true);
  });

  it("is idempotent for the full tier: a second run sends no transaction", async () => {
    const { fake, run } = setup("full");
    await run();
    const before = fake.calls.length;
    expect(before).toBeGreaterThan(100);
    await run();
    expect(fake.calls.length).toBe(before);
  });

  it("stops before any call when a representation is not registered", async () => {
    const empty = fakeCustodyChain({});
    await expect(
      seedCustody(empty.chain, { tier: "demo", fund: async () => undefined }),
    ).rejects.toThrow(/not registered|lacks/);
    expect(empty.calls).toEqual([]);
  });
});
