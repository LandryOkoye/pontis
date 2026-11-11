import { describe, expect, it } from "vitest";
import { tokenAccount } from "../lib/catalogue.ts";
import { custodyFor } from "../lib/catalogue-custody-tiers.ts";
import { seedRedemptions } from "../lib/seed-custody-redemptions.ts";
import { seedGatedMinters, seedTerms, type RepLookup } from "../lib/seed-custody-terms.ts";
import { DEPLOYER, fakeCustodyChain } from "./fake-custody-chain.ts";

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
  const run = () => seedRedemptions(fake.chain, demo.redemptions, reps, fake.as);
  return { fake, run };
}
const statusOf = (fake: ReturnType<typeof fakeCustodyChain>, rep: string) =>
  fake.redemptions.find((r) => r.representation_id === rep)?.status;

describe("simulated redemptions", () => {
  it("leave one requested, one accepted and one fulfilled, the last by burning the escrow", async () => {
    const { fake, run } = await ready();
    await run();
    expect(statusOf(fake, "tgkg-a")).toBe("requested");
    expect(statusOf(fake, "tmmfusd-m")).toBe("accepted");
    expect(statusOf(fake, "ttb3m-m")).toBe("fulfilled");
    expect(fake.tokenOf("ttb3m-m").supply).toBe(10_000_000_000n - 25_000_000n);
  });

  it("sign accept and fulfil as the issuer's token account, never as the deployer", async () => {
    const { fake, run } = await ready();
    await run();
    for (const c of fake.calls.filter((x) => /accept|fulfil/.test(x.method))) {
      expect(c.signer).toMatch(/^t[a-z0-9]+-[a-z]\.pontis\.testnet$/);
      expect(c.signer).not.toBe(DEPLOYER);
    }
  });

  it("change nothing when repeated, and finish a half-done redemption on the next run", async () => {
    const { fake, run } = await ready();
    await run();
    const before = fake.calls.length;
    await run();
    expect(fake.calls.length).toBe(before);
    const half = fake.redemptions.find((r) => r.status === "fulfilled")!;
    half.status = "accepted";
    fake.tokenOf("ttb3m-m").supply += 25_000_000n;
    await run();
    expect(half.status).toBe("fulfilled");
    expect(fake.methods().filter((m) => m === "ft_transfer_call")).toHaveLength(3);
  });

  it("stop with a plain message when a redemption has no terms to request against", async () => {
    const stale = fakeCustodyChain(supplies);
    await expect(seedRedemptions(stale.chain, demo.redemptions, reps, stale.as)).rejects.toThrow(
      /no redemption terms/,
    );
    expect(stale.redemptions).toHaveLength(0);
  });
});
