import { ENDPOINTS, type OperationId } from "@pontis/api-types";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UNAVAILABLE_IN_FIXTURES, buildFixturesApp } from "../src/fixtures-app.ts";

let app: FastifyInstance;
beforeAll(() => {
  app = buildFixturesApp();
});
afterAll(async () => {
  await app.close();
});

const PATH_ID: Partial<Record<OperationId, string>> = {
  getIssuer: "synthetic-issuer-a",
  getQuote: "c6a9f0a4-2b8e-4a53-8f06-2b9a0a6f3e11",
  getTransaction: "c6a9f0a4-2b8e-4a53-8f06-2b9a0a6f3e11",
};
const QUERY: Partial<Record<OperationId, string>> = {
  compareAssets: "?ids=tgold-a,tgold-b",
  search: "?q=gold",
  listTransactions: "?account=alice.testnet",
};

/** A request that satisfies every endpoint's params and query. */
const request = (operationId: OperationId) => {
  const e = ENDPOINTS[operationId];
  return {
    method: e.method.toUpperCase() as "GET" | "POST",
    url: e.path.replace("{id}", PATH_ID[operationId] ?? "tgold-a") + (QUERY[operationId] ?? ""),
  };
};

describe("fixtures mode", () => {
  it("answers every endpoint it supports with a body that passes the endpoint's own schema", async () => {
    const supported = (Object.keys(ENDPOINTS) as OperationId[]).filter(
      (op) => !UNAVAILABLE_IN_FIXTURES.includes(op),
    );
    for (const operationId of supported) {
      const res = await app.inject({
        ...request(operationId),
        ...(ENDPOINTS[operationId].method === "post"
          ? {
              payload: {
                fromId: "tgold-a",
                toId: "tgold-b",
                amountIn: "1",
                accountId: "alice.testnet",
              },
            }
          : {}),
      });
      expect([operationId, res.statusCode]).toEqual([operationId, ENDPOINTS[operationId].status]);
      ENDPOINTS[operationId].response.parse(res.json());
    }
  });

  it("marks every response as fixture data and refuses what needs a live chain", async () => {
    const ok = await app.inject({ method: "GET", url: "/v1/assets" });
    expect(ok.headers["x-pontis-mode"]).toBe("fixtures");
    for (const operationId of UNAVAILABLE_IN_FIXTURES) {
      const res = await app.inject({ ...request(operationId), payload: {} });
      expect([operationId, res.statusCode]).toEqual([operationId, 404]);
      expect(res.json().message).toContain("fixtures mode");
    }
  });

  it("serves a labelled NAV example for the fund id, no strike for a fungible asset, 404 otherwise", async () => {
    const get = async (url: string) => app.inject({ method: "GET", url });
    expect((await get("/v1/assets/tnav-a/nav")).json().strike).toMatchObject({ simulated: true });
    expect((await get("/v1/assets/tgold-a/nav")).json()).toMatchObject({ strike: null });
    expect((await get("/v1/assets/ghost/corporate-actions")).statusCode).toBe(404);
  });

  it("still validates requests like the real server, and 404s unknown records", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/assets?limit=0" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/v1/assets/ghost" })).statusCode).toBe(404);
  });

  it("serves the public metrics fixture and refuses the admin-keyed metrics endpoints", async () => {
    const pub = await app.inject({ method: "GET", url: "/v1/metrics/protocol" });
    expect([pub.statusCode, pub.headers["x-pontis-mode"]]).toEqual([200, "fixtures"]);
    expect(pub.json().metrics.length).toBeGreaterThan(0);
    for (const url of ["/v1/admin/metrics", "/metrics"]) {
      const res = await app.inject({ method: "GET", url });
      expect([url, res.statusCode]).toEqual([url, 404]);
    }
  });
});
