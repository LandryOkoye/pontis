import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { seedGatedMinters, seedTerms, type RepLookup } from "../lib/seed-custody-terms.ts";
import { CORE, DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

const demo = custodyFor("demo");
const reps: RepLookup = {
  accountOf: (id) => tokenAccount(id, DEPLOYER),
  decimalsOf: () => 6,
};
const supplies = Object.fromEntries(
  demo.custody.map((c) => [reps.accountOf(c.representationId), 10_000_000_000n]),
);

async function ready() {
  const fake = fakeCustodyChain(supplies);
  await seedTerms(fake.chain, demo.terms, reps);
  await seedGatedMinters(fake.chain, demo.custody, reps);
  return { fake };
}

describe("terms and the gated minter", () => {
  it("sets every term once and the core as minter of the gated tokens only", async () => {
    const { fake } = await ready();
    expect(fake.methods().filter((m) => m === "set_redemption_terms")).toHaveLength(
      demo.terms.length,
    );
    expect(fake.tokenOf("ttb3m-m").minter).toBe(CORE);
    expect(fake.tokenOf("tgkg-a").minter).toBeNull();
    const before = fake.calls.length;
    await seedTerms(fake.chain, demo.terms, reps);
    await seedGatedMinters(fake.chain, demo.custody, reps);
    expect(fake.calls.length).toBe(before);
  });

  it("sets a term again, with a new version, only when it differs from the chain", async () => {
    const { fake } = await ready();
    const changed = { ...demo.terms[0]!, feeBps: 75 };
    await seedTerms(fake.chain, [changed], reps);
    expect(fake.calls.at(-1)?.method).toBe("set_redemption_terms");
    expect(fake.terms.get(changed.representationId)?.version).toBe(2);
  });
});
