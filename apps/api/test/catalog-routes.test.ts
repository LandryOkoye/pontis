import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
let app: FastifyInstance;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
  app = buildApp(testAppDeps(t.db));
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("catalog routes", () => {
  it("serves issuers, assets and compatibility exactly as the API contract defines them", async () => {
    const issuers = await get("/v1/issuers");
    expect(issuers.statusCode).toBe(200);
    expect(ENDPOINTS.listIssuers.response.parse(issuers.json()).items).toHaveLength(2);
    expect(
      ENDPOINTS.getIssuer.response.parse((await get("/v1/issuers/synthetic-issuer-a")).json()).id,
    ).toBe("synthetic-issuer-a");

    const assets = ENDPOINTS.listAssets.response.parse((await get("/v1/assets")).json());
    expect(assets.items.map((a) => a.symbol)).toEqual(["TGOLD-A", "TGOLD-B"]);
    const detail = ENDPOINTS.getAsset.response.parse((await get("/v1/assets/tgold-a")).json());
    expect(detail).toMatchObject({
      standard: "NEP-141",
      synthetic: true,
      verificationStatus: "unverified",
      allowlistRequired: true,
    });

    const rel = ENDPOINTS.getAssetCompatibility.response.parse(
      (await get("/v1/assets/tgold-b/compatibility")).json(),
    );
    expect(rel.items[0]).toMatchObject({
      counterpartId: "tgold-a",
      parityEnabled: true,
      ratio: { num: "1", den: "1000" },
    });
  });

  it.each([
    "/v1/issuers/ghost",
    "/v1/assets/ghost",
    "/v1/assets/ghost/compatibility",
    "/v1/nothing",
  ])("returns a structured NOT_FOUND for %s", async (url) => {
    const res = await get(url);
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("NOT_FOUND");
  });

  it("hides internals behind a structured INTERNAL error", async () => {
    const broken = await createTestDb();
    const failing = buildApp(testAppDeps(broken.db));
    await broken.pool.end();
    const res = await failing.inject({ method: "GET", url: "/v1/issuers" });
    expect(res.statusCode).toBe(500);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: "INTERNAL",
      message: "Internal error",
    });
    await failing.close();
    await broken.drop();
  });
});
