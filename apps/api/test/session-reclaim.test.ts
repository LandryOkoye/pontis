// POST /v1/redemptions/{id}/reclaim-intent (ADR 0020 section 10).

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import type { Harness } from "./auth-helpers.ts";
import { auditRows, call, NOW, redemption, sessionHarness, tokenFor } from "./session-helpers.ts";
import type { ChainRedemption } from "@pontis/near-client";

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

const url = (id: string | number = 1) => `/v1/redemptions/${id}/reclaim-intent`;
const withRedemption = (r: ChainRedemption) => {
  h = sessionHarness(t.db, { getRedemption: async (id) => (id === r.id ? r : null) });
};
beforeEach(async () => {
  await h?.close();
});

describe("POST /v1/redemptions/{id}/reclaim-intent", () => {
  it.each([
    ["rejected", { status: "rejected", reject_reason: "no" }],
    ["expired", { status: "expired", miss: "accept" }],
  ] as const)(
    "returns the unsigned reclaim_redemption for a %s redemption of the caller",
    async (_n, over) => {
      withRedemption(redemption(over));
      const res = await call(h, "POST", url(), await tokenFor(h, "alice"));
      expect(res.statusCode).toBe(200);
      const out = ENDPOINTS.reclaimRedemptionIntent.response.parse(res.json());
      expect(out).toMatchObject({
        redemptionId: "1",
        intent: "reclaim",
        simulated: true,
        actions: [
          {
            receiverId: "core.testnet",
            methodName: "reclaim_redemption",
            args: { id: 1 },
            deposit: "1",
          },
        ],
      });
      const row = (await auditRows(t.db)).find(
        (r) => r.action === "session.redemption.reclaim_intent",
      );
      expect(row).toMatchObject({ actor: "alice.testnet", subject: url() });
    },
  );

  it("is reclaimable past the accept deadline of a request, and past the fulfil deadline of an accepted one", async () => {
    const base = redemption({ status: "requested", accepted_ms: null, fulfil_deadline_ms: null });
    withRedemption({ ...base, accept_deadline_ms: NOW.getTime() - 1 });
    expect((await call(h, "POST", url(), await tokenFor(h, "alice"))).statusCode).toBe(200);
    withRedemption(redemption({ status: "accepted", fulfil_deadline_ms: NOW.getTime() - 1 }));
    expect((await call(h, "POST", url(), await tokenFor(h, "alice"))).statusCode).toBe(200);
  });

  it.each([
    ["accepted and before its deadline", { status: "accepted" }],
    ["requested and before its deadline", { status: "requested", accepted_ms: null }],
    ["fulfilled", { status: "fulfilled" }],
    ["already reclaimed", { status: "reclaimed" }],
    ["rejected but with a token call in flight", { status: "rejected", settling: true }],
  ] as const)("409s STATE_CONFLICT for one that is %s", async (_n, over) => {
    withRedemption(redemption(over));
    const res = await call(h, "POST", url(), await tokenFor(h, "alice"));
    expect(res.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("STATE_CONFLICT");
  });

  it("403s every account but the redemption's own, the issuer back-office included", async () => {
    withRedemption(redemption({ status: "rejected" }));
    for (const who of ["bo", "eve", "owen"] as const) {
      const res = await call(h, "POST", url(), await tokenFor(h, who));
      expect(res.statusCode, who).toBe(403);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("FORBIDDEN");
    }
  });

  it("404s an unknown redemption, 400s a malformed id and 401s without a session", async () => {
    withRedemption(redemption({ status: "rejected" }));
    const token = await tokenFor(h, "alice");
    expect((await call(h, "POST", url(99), token)).statusCode).toBe(404);
    expect((await call(h, "POST", url("abc"), token)).statusCode).toBe(400);
    expect((await call(h, "POST", url(), undefined)).statusCode).toBe(401);
    expect((await call(h, "POST", url(), "nonsense")).statusCode).toBe(401);
  });
});
