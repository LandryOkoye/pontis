import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { buildCatalogue } from "../lib/catalogue-plan.ts";
import { custodyCost, renderCustodyCost } from "../lib/catalogue-custody-cost.ts";
import { custodyFor, custodySummary } from "../lib/catalogue-custody-tiers.ts";
import { catalogueFor, type CatalogueTier } from "../lib/catalogue-tiers.ts";
import { seedCustody } from "../lib/seed-custody.ts";
import { DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

describe("custody cost estimate", () => {
  it("is zero for mvp and grows from demo to full", () => {
    const [mvp, demo, full] = (["mvp", "demo", "full"] as const).map(custodyCost);
    expect(mvp?.transactions).toBe(0);
    expect(renderCustodyCost(mvp!)).toMatch(/none/);
    expect(demo!.transactions).toBeGreaterThan(30);
    expect(full!.transactions).toBeGreaterThan(demo!.transactions * 3);
    expect(full!.storage).toBeGreaterThan(demo!.storage);
    expect(renderCustodyCost(full!)).toMatch(/estimates/);
  });

  it("prints the custody counts the catalogue-plan command shows", () => {
    expect(custodySummary("demo")).toContain("5 custodians, 6 linked representations");
    expect(custodySummary("full")).toMatch(/1 never_attested.*19 redemption terms, 3 simulated/);
  });

  // The estimate is derived from the plan; the fake chain counts what the seed really sends.
  it.each(["demo", "full"] as const)(
    "counts the transactions the %s seed sends",
    async (tier: CatalogueTier) => {
      const data = custodyFor(tier);
      const ids = new Set(
        [...data.custody, ...data.terms, ...data.redemptions].map((r) => r.representationId),
      );
      const fake = fakeCustodyChain(
        Object.fromEntries([...ids].map((id) => [tokenAccount(id, DEPLOYER), 10_000_000_000n])),
      );
      await seedCustody(fake.chain, {
        tier,
        relayer: fake.chain,
        officeFor: fake.as,
        nowMs: fake.clock.now,
        statePath: `/tmp/custody-cost-${tier}.json`,
        fund: async () => undefined,
      });
      const vaulted = new Set(
        buildCatalogue(DEPLOYER, undefined, catalogueFor(tier))
          .representations.filter((r) => r.vaultInventory > 0n)
          .map((r) => r.representation.id),
      );
      // Not in the estimate: the three roles the catalogue seed granted, and registrations a vault already did.
      const notCounted = fake.calls.filter(
        (c) =>
          (c.method === "grant_role" && c.args.role !== "reserve_attester") ||
          (c.method === "storage_deposit" && vaulted.has(c.contract.split(".")[0]!)),
      ).length;
      expect(fake.calls.length - notCounted + 1).toBe(custodyCost(tier).transactions);
    },
  );
});
