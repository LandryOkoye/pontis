// The issuer's mint requests (ADR 0020 sections 6 and 10): the queue and the unsigned actions.

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainMintHeadroom, ChainMintRequest } from "@pontis/near-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import type { Harness } from "./auth-helpers.ts";
import { auditRows, call, pagedOver, sessionHarness, tokenFor } from "./session-helpers.ts";

let t: TestDb;
let h: Harness;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await h?.close();
  await t.drop();
});
beforeEach(async () => {
  await h?.close();
});

const mint = (id: number, over: Partial<ChainMintRequest> = {}): ChainMintRequest => ({
  id,
  representation_id: "tgold-a",
  recipient: "alice.testnet",
  amount: "5000000",
  reference: `sub-${id}`,
  status: "requested",
  requested_by: "issuer-bo.testnet",
  requested_ms: 1_794_000_000_000 + id,
  resolved_ms: null,
  failure: null,
  ...over,
});
const headroom = (over: Partial<ChainMintHeadroom> = {}): ChainMintHeadroom => ({
  headroom_units: "10000000",
  circulating_units: "0",
  attested_units: "10000000",
  state: "ok",
  mint_paused: false,
  ...over,
});
const use = (all: ChainMintRequest[], room = headroom()) => {
  h = sessionHarness(t.db, {
    getMintRequest: async (id) => all.find((r) => r.id === id) ?? null,
    getMintRequests: ((rep: string, from: number, limit: number) =>
      pagedOver(all.filter((r) => r.representation_id === rep))(from, limit)) as never,
    getMintHeadroom: async () => room,
  });
};
const post = async (who: Parameters<typeof tokenFor>[1], path: string, payload?: unknown) =>
  call(h, "POST", `/v1/issuer/mint-requests${path}`, await tokenFor(h, who), payload);

describe("GET /v1/issuer/mint-requests", () => {
  const all = [
    mint(1, { status: "minted", resolved_ms: 1_794_000_100_000 }),
    mint(2),
    mint(3, { status: "minting" }),
    mint(11, { representation_id: "tgold-b" }),
  ];

  it("lists the mints of the issuer's assets, newest first, with the chain's status", async () => {
    use(all);
    const res = await call(h, "GET", "/v1/issuer/mint-requests", await tokenFor(h, "bo"));
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.listIssuerMintRequests.response.parse(res.json());
    expect(body.items.map((r) => [r.id, r.status])).toEqual([
      ["3", "minting"],
      ["2", "requested"],
      ["1", "minted"],
    ]);
    expect(body.items[2]?.resolvedAt).not.toBeNull();
    expect(body.issuerIds).toEqual(["synthetic-issuer-a"]);
    expect(body).toMatchObject({ simulated: true, sources: ["simulated_issuer"] });
  });

  it("filters by status, lets an operator read all, and refuses strangers and other issuers", async () => {
    use(all);
    const only = await call(
      h,
      "GET",
      "/v1/issuer/mint-requests?status=minting",
      await tokenFor(h, "bo"),
    );
    expect(only.json().items.map((r: { id: string }) => r.id)).toEqual(["3"]);
    const op = await call(h, "GET", "/v1/issuer/mint-requests", await tokenFor(h, "owen"));
    expect(op.json().items.map((r: { id: string }) => r.id)).toEqual(["11", "3", "2", "1"]);
    expect(
      (await call(h, "GET", "/v1/issuer/mint-requests", await tokenFor(h, "eve"))).statusCode,
    ).toBe(403);
    expect(
      (
        await call(
          h,
          "GET",
          "/v1/issuer/mint-requests?representationId=tgold-b",
          await tokenFor(h, "bo"),
        )
      ).statusCode,
    ).toBe(403);
    expect((await call(h, "GET", "/v1/issuer/mint-requests")).statusCode).toBe(401);
    expect(
      (await call(h, "GET", "/v1/issuer/mint-requests?status=done", await tokenFor(h, "bo")))
        .statusCode,
    ).toBe(400);
  });
});

describe("POST /v1/issuer/mint-requests", () => {
  const body = {
    representationId: "tgold-a",
    recipient: "alice.testnet",
    amount: "5000000",
    reference: "sub-9",
  };

  it("returns the unsigned request_mint, which only records an intent", async () => {
    use([]);
    const res = await post("bo", "", body);
    expect(res.statusCode).toBe(200);
    expect(ENDPOINTS.createIssuerMintRequest.response.parse(res.json())).toMatchObject({
      intent: "request",
      requestId: null,
      assetId: "tgold-a",
      amount: "5000000",
      headroomUnits: null,
      actions: [
        {
          receiverId: "core.testnet",
          methodName: "request_mint",
          args: {
            representation_id: "tgold-a",
            recipient: "alice.testnet",
            amount: "5000000",
            reference: "sub-9",
          },
          deposit: "1",
        },
      ],
    });
    const row = (await auditRows(t.db)).find((r) => r.action === "issuer.mint_request.create");
    expect(row?.actor).toBe("issuer-bo.testnet");
  });

  it("403s accounts of another issuer, an operator and a stranger; 404s an unknown asset", async () => {
    use([]);
    for (const who of ["bob", "owen", "eve", "alice"] as const)
      expect((await post(who, "", body)).statusCode, who).toBe(403);
    expect((await post("bo", "", { ...body, representationId: "nope" })).statusCode).toBe(404);
  });

  it.each([
    ["zero amount", { amount: "0" }],
    ["a bad recipient", { recipient: "Not An Account" }],
    ["an over-long reference", { reference: "r".repeat(65) }],
    ["an unknown field", { extra: true }],
  ])("400s %s", async (_n, over) => {
    use([]);
    const res = await post("bo", "", { ...body, ...over });
    expect(res.statusCode).toBe(400);
  });

  it("401s without a session", async () => {
    use([]);
    expect((await call(h, "POST", "/v1/issuer/mint-requests", undefined, body)).statusCode).toBe(
      401,
    );
  });
});

describe("POST /v1/issuer/mint-requests/{id}/execute", () => {
  it("returns the unsigned execute_mint with the headroom it was checked against", async () => {
    use([mint(2)]);
    const res = await post("bo", "/2/execute");
    expect(res.statusCode).toBe(200);
    expect(ENDPOINTS.executeIssuerMintRequest.response.parse(res.json())).toMatchObject({
      intent: "execute",
      requestId: "2",
      headroomUnits: "10000000",
      actions: [{ methodName: "execute_mint", args: { request_id: 2 }, deposit: "1" }],
    });
  });

  it("allows an amount exactly equal to the headroom and refuses one unit more (422 MINT_REFUSED)", async () => {
    use([mint(2, { amount: "10000000" }), mint(3, { amount: "10000001" })]);
    expect((await post("bo", "/2/execute")).statusCode).toBe(200);
    const over = await post("bo", "/3/execute");
    expect(over.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(over.json()).code).toBe("MINT_REFUSED");
    expect(over.json().message).toMatch(/headroom of 10000000/);
  });

  it.each([
    ["no reserve policy", headroom({ state: "unmonitored", headroom_units: "0" })],
    ["a paused mint", headroom({ mint_paused: true })],
  ])("422s MINT_REFUSED for %s", async (_n, room) => {
    use([mint(2)], room);
    const res = await post("bo", "/2/execute");
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("MINT_REFUSED");
  });

  it.each(["minting", "minted", "failed", "cancelled"] as const)(
    "409s STATE_CONFLICT for a %s request",
    async (status) => {
      use([mint(2, { status })]);
      const res = await post("bo", "/2/execute");
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("STATE_CONFLICT");
    },
  );

  it("403s non-back-office accounts, 404s unknown ids, 400s bad ids, 401s anonymous", async () => {
    use([mint(2)]);
    for (const who of ["bob", "owen", "eve"] as const)
      expect((await post(who, "/2/execute")).statusCode, who).toBe(403);
    expect((await post("bo", "/99/execute")).statusCode).toBe(404);
    expect((await post("bo", "/x/execute")).statusCode).toBe(400);
    expect((await call(h, "POST", "/v1/issuer/mint-requests/2/execute")).statusCode).toBe(401);
  });
});
