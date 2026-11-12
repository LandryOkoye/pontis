import { assetProfiles, assetRepresentations, compatibilityRelationships } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assetsRegistered,
  chainsLive,
  directEquivalentRoutesLive,
  issuersActive,
  representationsActive,
} from "../src/metrics/routes.ts";
import { assetsThirdPartyAttestedPct } from "../src/metrics/trust.ts";
import { context, seedRegistry } from "./metrics-helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.drop());

const setRep = (id: string, set: Partial<typeof assetRepresentations.$inferInsert>) =>
  t.db.update(assetRepresentations).set(set).where(eq(assetRepresentations.id, id));

describe("empty registry", () => {
  it("counts 0 and has no attested share", async () => {
    const ctx = context(t.db);
    for (const m of [
      directEquivalentRoutesLive,
      assetsRegistered,
      representationsActive,
      issuersActive,
      chainsLive,
    ])
      expect([m.name, (await m(ctx)).value]).toEqual([m.name, 0]);
    expect((await assetsThirdPartyAttestedPct(ctx)).value).toBeNull();
  });
});

describe("route coverage on the fixture registry", () => {
  beforeAll(() => seedRegistry(t.db));

  it("counts one approved pair, one asset, two representations, two issuers, NEAR only", async () => {
    const ctx = context(t.db);
    expect((await directEquivalentRoutesLive(ctx)).value).toBe(1);
    expect((await assetsRegistered(ctx)).value).toBe(1);
    expect((await representationsActive(ctx)).value).toBe(2);
    expect((await issuersActive(ctx)).value).toBe(2);
    expect((await chainsLive(ctx)).value).toBe(1);
    expect((await chainsLive(ctx)).simulated).toBe(true);
  });

  it("chains_live adds distinct non-planned profile chains of active representations", async () => {
    await t.db.insert(assetProfiles).values([
      {
        representationId: "tgold-a",
        description: "a",
        chains: [
          { chain: "near-testnet", contract: "tgold-a.pontis.testnet", role: "native" },
          { chain: "base-sepolia", contract: null, role: "wrapped" },
          { chain: "solana-devnet", contract: null, role: "planned" },
        ],
        source: "simulated_feed",
        simulated: true,
      },
      {
        representationId: "tgold-b",
        description: "b",
        chains: [
          { chain: "base-sepolia", contract: null, role: "wrapped" },
          { chain: "arbitrum-sepolia", contract: null, role: "wrapped" },
        ],
        source: "simulated_feed",
        simulated: true,
      },
    ]);
    expect((await chainsLive(context(t.db))).value).toBe(3);
    // A paused representation no longer counts for its own chains.
    await setRep("tgold-b", { status: "paused" });
    expect((await chainsLive(context(t.db))).value).toBe(2);
  });

  it("a paused representation takes its route, its issuer and its share of the active count", async () => {
    // tgold-b is still paused from the previous test.
    const ctx = context(t.db);
    expect((await directEquivalentRoutesLive(ctx)).value).toBe(0);
    expect((await representationsActive(ctx)).value).toBe(1);
    expect((await issuersActive(ctx)).value).toBe(1);
    await setRep("tgold-b", { status: "active" });
    await t.db.update(compatibilityRelationships).set({ status: "suspended" });
    expect((await directEquivalentRoutesLive(context(t.db))).value).toBe(0);
    await t.db.update(compatibilityRelationships).set({ status: "approved" });
    expect((await directEquivalentRoutesLive(context(t.db))).value).toBe(1);
  });

  it("assets_third_party_attested_pct is a percentage of active representations, 0 by default", async () => {
    expect((await assetsThirdPartyAttestedPct(context(t.db))).value).toBe("0.000000");
    await setRep("tgold-a", { verificationStatus: "third_party_attested" });
    expect((await assetsThirdPartyAttestedPct(context(t.db))).value).toBe("50.000000");
    await setRep("tgold-b", { verificationStatus: "issuer_attested" });
    expect((await assetsThirdPartyAttestedPct(context(t.db))).value).toBe("50.000000");
    await setRep("tgold-b", { verificationStatus: "independently_verified", status: "paused" });
    expect((await assetsThirdPartyAttestedPct(context(t.db))).value).toBe("100.000000");
  });
});
