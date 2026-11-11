// The issuer back-office redemption queue and its unsigned accept, reject and fulfil (ADR 0020 section 10).

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { redemptionPayoutInstructions } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRedemption } from "@pontis/near-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import type { Harness } from "./auth-helpers.ts";
import {
  auditRows,
  call,
  controlledIssuers,
  NOW,
  pagedOver,
  redemption,
  sessionHarness,
  tokenFor,
} from "./session-helpers.ts";

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

/** Redemptions 1..n on tgold-a (issuer A) and 101.. on tgold-b (issuer B). */
const queueOf = (all: ChainRedemption[]) => ({
  getRedemption: async (id: number) => all.find((r) => r.id === id) ?? null,
  getRedemptionsByRepresentation: ((rep: string, from: number, limit: number) =>
    pagedOver(all.filter((r) => r.representation_id === rep))(from, limit)) as never,
});
const use = (all: ChainRedemption[]) => {
  h = sessionHarness(t.db, queueOf(all));
};
const onB = (id: number, over: Partial<ChainRedemption> = {}) =>
  redemption({ id, representation_id: "tgold-b", issuer_id: "synthetic-issuer-b", ...over });

describe("GET /v1/issuer/redemptions", () => {
  const all = [
    redemption({ id: 1, status: "requested", accepted_ms: null, fulfil_deadline_ms: null }),
    redemption({ id: 2, status: "accepted" }),
    redemption({ id: 3, status: "fulfilled" }),
    onB(101, { status: "requested", accepted_ms: null, fulfil_deadline_ms: null }),
  ];

  it("lists the queue of the issuers the account controls, newest first, and no others", async () => {
    use(all);
    const res = await call(h, "GET", "/v1/issuer/redemptions", await tokenFor(h, "bo"));
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.listIssuerRedemptions.response.parse(res.json());
    expect(body.items.map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(body.issuerIds).toEqual(["synthetic-issuer-a"]);
    expect(body).toMatchObject({
      simulated: true,
      sources: ["simulated_issuer"],
      nextCursor: null,
    });
  });

  it("filters by status and by asset", async () => {
    use(all);
    const token = await tokenFor(h, "bo");
    const open = await call(h, "GET", "/v1/issuer/redemptions?status=requested", token);
    expect(open.json().items.map((r: { id: string }) => r.id)).toEqual(["1"]);
    const asset = await call(h, "GET", "/v1/issuer/redemptions?representationId=tgold-a", token);
    expect(asset.json().items).toHaveLength(3);
  });

  it("403s a read of another issuer's asset, and an account that controls no issuer", async () => {
    use(all);
    const other = await call(
      h,
      "GET",
      "/v1/issuer/redemptions?representationId=tgold-b",
      await tokenFor(h, "bo"),
    );
    expect(other.statusCode).toBe(403);
    const stranger = await call(h, "GET", "/v1/issuer/redemptions", await tokenFor(h, "eve"));
    expect(stranger.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(stranger.json()).code).toBe("FORBIDDEN");
    expect(
      (
        await call(
          h,
          "GET",
          "/v1/issuer/redemptions?representationId=nope",
          await tokenFor(h, "bo"),
        )
      ).statusCode,
    ).toBe(404);
  });

  it("lets an operator role read every issuer's queue", async () => {
    use(all);
    const res = await call(h, "GET", "/v1/issuer/redemptions", await tokenFor(h, "owen"));
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.listIssuerRedemptions.response.parse(res.json());
    expect(body.items.map((r) => r.id)).toEqual(["101", "3", "2", "1"]);
    expect(body.issuerIds.sort()).toEqual(["synthetic-issuer-a", "synthetic-issuer-b"]);
  });

  it("pages with a cursor that holds the last id, without repeats", async () => {
    use(all);
    const token = await tokenFor(h, "owen");
    const first = ENDPOINTS.listIssuerRedemptions.response.parse(
      (await call(h, "GET", "/v1/issuer/redemptions?limit=3", token)).json(),
    );
    expect(first.items.map((r) => r.id)).toEqual(["101", "3", "2"]);
    expect(first.nextCursor).not.toBeNull();
    const second = ENDPOINTS.listIssuerRedemptions.response.parse(
      (
        await call(h, "GET", `/v1/issuer/redemptions?limit=3&cursor=${first.nextCursor}`, token)
      ).json(),
    );
    expect(second.items.map((r) => r.id)).toEqual(["1"]);
    expect(second.nextCursor).toBeNull();
    const reused = await call(
      h,
      "GET",
      `/v1/issuer/redemptions?limit=3&status=fulfilled&cursor=${first.nextCursor}`,
      token,
    );
    expect(reused.statusCode).toBe(400);
  });

  it("never carries a payout instruction, even for a redemption whose instruction is stored", async () => {
    use(all);
    const ciphertext = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
    await t.db.insert(redemptionPayoutInstructions).values({
      accountId: "alice.testnet",
      representationId: "tgold-a",
      amount: "5000000",
      termsHash: "c".repeat(64),
      payoutInstructionHash: "d".repeat(64),
      ciphertext,
      redemptionId: 2,
    });
    for (const who of ["bo", "owen"] as const) {
      const res = await call(h, "GET", "/v1/issuer/redemptions", await tokenFor(h, who));
      expect(res.body).not.toContain(ciphertext);
      expect(res.body).not.toMatch(/ciphertext|"payoutInstruction"/);
    }
  });

  it("401s without a session and audits an allowed read", async () => {
    use(all);
    expect((await call(h, "GET", "/v1/issuer/redemptions")).statusCode).toBe(401);
    await call(h, "GET", "/v1/issuer/redemptions", await tokenFor(h, "bo"));
    const row = (await auditRows(t.db)).find((r) => r.action === "issuer.redemptions.read");
    expect(row).toMatchObject({ actor: "issuer-bo.testnet", subject: "/v1/issuer/redemptions" });
  });

  it("400s an unknown status", async () => {
    use(all);
    const res = await call(h, "GET", "/v1/issuer/redemptions?status=paid", await tokenFor(h, "bo"));
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/issuer/redemptions/{id}/accept|reject|fulfil", () => {
  const requested = redemption({
    id: 1,
    status: "requested",
    accepted_ms: null,
    fulfil_deadline_ms: null,
  });
  const accepted = redemption({ id: 2, status: "accepted" });
  const all = [requested, accepted, redemption({ id: 3, status: "fulfilled" }), onB(101)];
  const post = async (
    who: "bo" | "eve" | "bob" | "owen" | "alice",
    path: string,
    payload?: unknown,
  ) => call(h, "POST", `/v1/issuer/redemptions/${path}`, await tokenFor(h, who), payload);

  it("builds the unsigned actions the contract methods take, with 1 yocto", async () => {
    use(all);
    const accept = await post("bo", "1/accept");
    expect(accept.statusCode).toBe(200);
    expect(ENDPOINTS.acceptRedemption.response.parse(accept.json())).toMatchObject({
      redemptionId: "1",
      intent: "accept",
      status: "requested",
      actions: [
        {
          receiverId: "core.testnet",
          methodName: "accept_redemption",
          args: { id: 1 },
          deposit: "1",
        },
      ],
    });
    const reject = await post("bo", "2/reject", { reason: "name mismatch" });
    expect(reject.json().actions[0]).toMatchObject({
      methodName: "reject_redemption",
      args: { id: 2, reason: "name mismatch" },
    });
    const fulfil = await post("bo", "2/fulfil", { evidenceHash: "e".repeat(64) });
    expect(fulfil.json().actions[0]).toMatchObject({
      methodName: "fulfil_redemption",
      args: { id: 2, evidence_hash: "e".repeat(64) },
    });
    const actions = (await auditRows(t.db)).map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "issuer.redemption.accept",
        "issuer.redemption.reject",
        "issuer.redemption.fulfil",
      ]),
    );
  });

  it("allows a reject of a request or an accepted one, and not of a finished one", async () => {
    use(all);
    expect((await post("bo", "1/reject", { reason: "x" })).statusCode).toBe(200);
    expect((await post("bo", "2/reject", { reason: "x" })).statusCode).toBe(200);
    expect((await post("bo", "3/reject", { reason: "x" })).statusCode).toBe(409);
  });

  it.each([
    ["accept an accepted request", "2/accept", undefined],
    ["accept a fulfilled one", "3/accept", undefined],
    ["fulfil a request that was never accepted", "1/fulfil", { evidenceHash: "e".repeat(64) }],
    ["fulfil a fulfilled one", "3/fulfil", { evidenceHash: "e".repeat(64) }],
  ])("409s STATE_CONFLICT when asked to %s", async (_n, path, payload) => {
    use(all);
    const res = await post("bo", path, payload);
    expect(res.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("STATE_CONFLICT");
  });

  it("refuses past the deadlines, and while a token call is in flight", async () => {
    use([
      redemption({
        id: 1,
        status: "requested",
        accepted_ms: null,
        accept_deadline_ms: NOW.getTime() - 1,
      }),
      redemption({ id: 2, status: "accepted", fulfil_deadline_ms: NOW.getTime() - 1 }),
      redemption({ id: 3, status: "accepted", settling: true }),
    ]);
    expect((await post("bo", "1/accept")).statusCode).toBe(409);
    expect((await post("bo", "1/reject", { reason: "late" })).statusCode).toBe(409);
    expect((await post("bo", "2/fulfil", { evidenceHash: "e".repeat(64) })).statusCode).toBe(409);
    expect((await post("bo", "3/fulfil", { evidenceHash: "e".repeat(64) })).statusCode).toBe(409);
  });

  it("403s accounts that are not the issuer's back-office and audits the refusal", async () => {
    use(all);
    for (const who of ["eve", "alice", "owen", "bob"] as const) {
      const res = await post(who, "1/accept");
      expect(res.statusCode, who).toBe(403);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("FORBIDDEN");
    }
    const refused = (await auditRows(t.db)).filter((r) => r.action === "session.issuer.forbidden");
    expect(refused.map((r) => r.actor)).toEqual(
      expect.arrayContaining([
        "eve.testnet",
        "alice.testnet",
        "owen.testnet",
        "issuer-b-bo.testnet",
      ]),
    );
  });

  it("403s a back-office account of a suspended issuer: the contract requires an active one", async () => {
    h = sessionHarness(t.db, {
      ...queueOf(all),
      getIssuer: async (id) => ({
        ...controlledIssuers.find((i) => i.id === id)!,
        status: "paused",
      }),
    });
    expect((await post("bo", "1/accept")).statusCode).toBe(403);
  });

  it("404s an unknown redemption, 400s bad ids and bodies, 401s without a session", async () => {
    use(all);
    expect((await post("bo", "99/accept")).statusCode).toBe(404);
    expect((await post("bo", "abc/accept")).statusCode).toBe(400);
    expect((await post("bo", "1/reject", { reason: "" })).statusCode).toBe(400);
    expect((await post("bo", "1/reject", { reason: "x".repeat(65) })).statusCode).toBe(400);
    expect((await post("bo", "2/fulfil", { evidenceHash: "xyz" })).statusCode).toBe(400);
    expect((await post("bo", "2/fulfil", {})).statusCode).toBe(400);
    expect((await call(h, "POST", "/v1/issuer/redemptions/1/accept")).statusCode).toBe(401);
  });
});
