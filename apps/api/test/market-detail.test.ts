import { ENDPOINTS } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { NOW, seedMarket } from "./market-helpers.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  await seedMarket(t.db);
  app = buildApp(testAppDeps(t.db, { now: () => NOW }));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const get = async (path: string) => app.inject({ method: "GET", url: `/v1/assets/${path}` });

describe("asset detail tabs", () => {
  it("serves the dossier with its source, and null when no dossier was loaded", async () => {
    const a = ENDPOINTS.getAssetMetadata.response.parse((await get("tgold-a/metadata")).json());
    expect(a.profile).toMatchObject({
      source: "simulated_feed",
      simulated: true,
      bridgeable: true,
    });
    expect(a.profile?.tags).toEqual(["gold", "synthetic"]);
    const b = ENDPOINTS.getAssetMetadata.response.parse((await get("tgold-b/metadata")).json());
    expect([b.profile, b.canonicalAssetId]).toEqual([null, "syn-gold-oz"]);
  });

  it("returns the issuer with its evidence and the issuer's assets", async () => {
    const view = ENDPOINTS.getAssetIssuer.response.parse((await get("tgold-a/issuer")).json());
    expect(view.issuer.id).toBe("synthetic-issuer-a");
    expect(view.issuer.evidence.length).toBeGreaterThan(0);
    expect(view.assets.map((a) => a.id)).toEqual(["tgold-a"]);
  });

  it("takes the NEAR contract from the registry and adds supply per chain", async () => {
    const detail = ENDPOINTS.getAsset.response.parse((await get("tgold-a")).json());
    const { items } = ENDPOINTS.getAssetChains.response.parse((await get("tgold-a/chains")).json());
    const near = items.find((c) => c.chain === "near-testnet");
    expect([near?.contract, near?.role, near?.supply, near?.simulated]).toEqual([
      detail.accountId,
      "native",
      "1000000000",
      true,
    ]);
    expect(items.find((c) => c.chain === "base-sepolia")).toMatchObject({
      contract: null,
      role: "wrapped",
      supply: "500000000",
    });
    // No dossier: one NEAR entry, from the registry alone.
    const b = ENDPOINTS.getAssetChains.response.parse((await get("tgold-b/chains")).json());
    expect(b.items.map((c) => [c.chain, c.supply])).toEqual([["near-testnet", "900000000000"]]);
  });

  it("lists registry evidence with the provenance the registry recorded", async () => {
    const { items } = ENDPOINTS.getAssetDocuments.response.parse(
      (await get("tgold-a/documents")).json(),
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((d) => d.origin === "registry_evidence" && d.provenance !== null)).toBe(
      true,
    );
    expect(items.every((d) => d.provenance === "issuer_provided")).toBe(true);
  });

  it("is 404 for an unknown asset on every tab", async () => {
    for (const tab of ["metadata", "issuer", "chains", "documents"]) {
      expect([tab, (await get(`ghost/${tab}`)).statusCode]).toEqual([tab, 404]);
    }
  });
});
