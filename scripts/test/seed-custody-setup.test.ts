import { devKey } from "@pontis/dev-keys";
import { describe, expect, it } from "vitest";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { seedAttesterRole, seedCustodians, seedLinks } from "../lib/seed-custody-setup.ts";
import { CORE, DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

const demo = custodyFor("demo");
describe("seedAttesterRole", () => {
  it("grants the role to the simulated custodian's account and registers the dev key with scope reserves", async () => {
    const fake = fakeCustodyChain().withRegistrar();
    await seedAttesterRole(fake.chain);
    expect(fake.methods()).toEqual(["grant_role", "add_signer_key"]);
    expect(fake.calls[0]?.args).toEqual({
      role: "reserve_attester",
      account_id: `custodian-sim.${DEPLOYER}`,
    });
    expect(fake.calls[1]?.args).toMatchObject({
      public_key: devKey("reserve-attester").publicKey,
      scopes: ["reserves"],
    });
  });

  it("refuses to make the registrar an attester, and the attester a registrar", async () => {
    const fake = fakeCustodyChain().withRegistrar();
    fake.roles.set("reserve_attester", new Set([DEPLOYER]));
    await expect(seedAttesterRole(fake.chain)).rejects.toThrow(/cannot also act as the registrar/);
  });
});

describe("custodians and links", () => {
  it("register every custodian of the tier, then link every representation, once", async () => {
    const fake = fakeCustodyChain().withRegistrar();
    await seedAttesterRole(fake.chain);
    await seedCustodians(fake.chain, demo.custodians);
    await seedLinks(fake.chain, demo.custody);
    const count = (m: string) => fake.methods().filter((x) => x === m).length;
    expect(count("register_custodian")).toBe(demo.custodians.length);
    expect(count("link_custody")).toBe(demo.custody.length);
    expect(fake.calls.every((c) => c.contract === CORE)).toBe(true);

    const before = fake.calls.length;
    await seedAttesterRole(fake.chain);
    await seedCustodians(fake.chain, demo.custodians);
    await seedLinks(fake.chain, demo.custody);
    expect(fake.calls.length).toBe(before);
  });

  it("relinks only a representation whose link differs", async () => {
    const fake = fakeCustodyChain().withRegistrar();
    await seedAttesterRole(fake.chain);
    await seedCustodians(fake.chain, demo.custodians);
    await seedLinks(fake.chain, demo.custody);
    const [first, ...rest] = demo.custody;
    const changed = {
      ...first!,
      structure: first!.structure === "omnibus" ? ("segregated" as const) : ("omnibus" as const),
    };
    const before = fake.calls.length;
    await seedLinks(fake.chain, [changed, ...rest]);
    expect(fake.calls.length - before).toBe(1);
  });
});
