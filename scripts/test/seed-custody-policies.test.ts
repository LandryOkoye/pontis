import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { seedPolicies } from "../lib/seed-custody-policies.ts";
import { seedAttesterRole, seedCustodians, seedLinks } from "../lib/seed-custody-setup.ts";
import { DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

const { custodians, custody } = custodyFor("full");
const accountOf = (id: string) => tokenAccount(id, DEPLOYER);
const SUPPLY = 1_000_000_000_000n;
const supplies = Object.fromEntries(custody.map((c) => [accountOf(c.representationId), SUPPLY]));

async function linked() {
  const fake = fakeCustodyChain(supplies).withRegistrar();
  await seedAttesterRole(fake.chain);
  await seedCustodians(fake.chain, custodians);
  await seedLinks(fake.chain, custody);
  return fake;
}

describe("seedPolicies", () => {
  it("sets each policy with the token's supply as the baseline", async () => {
    const fake = await linked();
    await seedPolicies(fake.chain, custody, accountOf);
    const policies = fake.calls.filter((c) => c.method === "set_reserve_policy");
    expect(policies).toHaveLength(custody.length);
    for (const p of policies) {
      expect((p.args.policy as { baseline_supply: string }).baseline_supply).toBe(
        SUPPLY.toString(),
      );
    }
  });

  it("changes nothing when repeated", async () => {
    const fake = await linked();
    await seedPolicies(fake.chain, custody, accountOf);
    const before = fake.calls.length;
    await seedPolicies(fake.chain, custody, accountOf);
    expect(fake.calls.length).toBe(before);
  });

  it("updates a policy that differs and keeps the baseline the contract fixed", async () => {
    const fake = await linked();
    await seedPolicies(fake.chain, custody, accountOf);
    const row = custody.find((c) => c.story === "thin")!;
    const supplyNow = SUPPLY * 2n;
    supplies[accountOf(row.representationId)] = supplyNow;
    await seedPolicies(
      fake.chain,
      [{ ...row, policy: { ...row.policy, toleranceBps: 200 } }],
      accountOf,
    );
    const last = fake.calls.at(-1)!;
    expect(last.method).toBe("set_reserve_policy");
    expect(last.args.policy).toMatchObject({
      tolerance_bps: 200,
      baseline_supply: SUPPLY.toString(),
    });
  });
});
