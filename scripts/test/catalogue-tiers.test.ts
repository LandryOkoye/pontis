import { describe, expect, it } from "vitest";
import { buildCatalogue } from "../lib/catalogue-plan.ts";
import { catalogueCost, nearText, SLIM_TOKEN_WASM_BYTES } from "../lib/catalogue-cost.ts";
import { catalogueTargets, fundingFor } from "../lib/deploy-plan.ts";
import { BASE_CATALOGUE, catalogueFor, parseTier, tierFromArgs } from "../lib/catalogue-tiers.ts";
import { buildProfiles } from "../lib/seed-profiles.ts";

describe("catalogue tiers", () => {
  it("makes mvp empty, demo the phase 1 catalogue plus some, and full everything", () => {
    const [mvp, demo, full] = (["mvp", "demo", "full"] as const).map(catalogueFor);
    expect(mvp?.representations).toHaveLength(0);
    expect(demo?.representations.length).toBeGreaterThan(BASE_CATALOGUE.representations.length);
    expect(full?.representations.length).toBeGreaterThan(demo?.representations.length ?? 0);
    for (const rep of BASE_CATALOGUE.representations) {
      expect(demo?.representations).toContain(rep);
      expect(full?.representations).toContain(rep);
    }
    // Every demo entry is also in full.
    for (const rep of demo?.representations ?? []) expect(full?.representations).toContain(rep);
  });

  it("parses --catalogue=<tier>, a bare --catalogue as demo, and the caller's default when absent", () => {
    expect(tierFromArgs(["--catalogue=full"], "mvp")).toBe("full");
    expect(tierFromArgs(["--redeploy", "--catalogue"], "mvp")).toBe("demo");
    expect(tierFromArgs(["--redeploy"], "mvp")).toBe("mvp");
    expect(tierFromArgs([], "demo")).toBe("demo");
    expect(() => tierFromArgs(["--catalogue=huge"], "demo")).toThrow(
      /must be one of mvp, demo, full/,
    );
    expect(() => tierFromArgs(["--catalogue=demo", "--catalogue=full"], "demo")).toThrow(/twice/);
    expect(() => parseTier("")).toThrow();
  });

  it("plans, deploys and profiles exactly the representations of the tier", () => {
    for (const tier of ["demo", "full"] as const) {
      const data = catalogueFor(tier);
      const ids = data.representations.map((r) => r.id).sort();
      expect(
        buildCatalogue("pontis.testnet", undefined, data)
          .representations.map((r) => r.representation.id)
          .sort(),
      ).toEqual(ids);
      expect(
        catalogueTargets("pontis.testnet", data)
          .map((t) => t.accountId)
          .sort(),
      ).toEqual(ids.map((id) => `${id}.pontis.testnet`).sort());
      expect(
        buildProfiles("pontis.testnet", undefined, data)
          .map((p) => p.representationId)
          .sort(),
      ).toEqual(ids);
    }
    expect(catalogueTargets("pontis.testnet", catalogueFor("mvp"))).toEqual([]);
  });

  it("labels every generated profile as simulated and SYNTHETIC", () => {
    for (const row of buildProfiles("pontis.testnet", undefined, catalogueFor("full"))) {
      expect([row.source, row.simulated]).toEqual(["simulated_feed", true]);
      expect(row.description).toContain("SYNTHETIC");
      for (const text of Object.values(row.sections ?? {})) expect(text).toContain("SYNTHETIC");
      expect(row.documents).toHaveLength(2);
    }
  });
});

describe("catalogue cost", () => {
  it("is one funded token account per representation, scaling with the tier", () => {
    const [mvp, demo, full] = (["mvp", "demo", "full"] as const).map((t) => catalogueCost(t));
    expect(mvp?.tokenAccounts).toBe(0);
    expect(mvp?.tokenAccountsTotal).toBe(0n);
    expect(mvp?.deployTransactions).toBe(0);
    expect(mvp?.seedTransactions).toBe(0);
    for (const c of [demo, full]) {
      expect(c?.perTokenAccount).toBe(fundingFor(SLIM_TOKEN_WASM_BYTES));
      expect(c?.tokenAccountsTotal).toBe(
        BigInt(c?.tokenAccounts ?? 0) * (c?.perTokenAccount ?? 0n),
      );
      expect(c?.deployTransactions).toBe((c?.tokenAccounts ?? 0) * 3);
    }
    expect(full?.tokenAccountsTotal).toBeGreaterThan(demo?.tokenAccountsTotal ?? 0n);
    expect(full?.seedTransactions).toBeGreaterThan(demo?.seedTransactions ?? 0);
  });

  it("states NEAR rounded up to two decimals", () => {
    expect(nearText(2_796_000_000_000_000_000_000_000n)).toBe("2.80");
    expect(nearText(10n ** 24n)).toBe("1.00");
    expect(nearText(1n)).toBe("0.01");
  });
});
