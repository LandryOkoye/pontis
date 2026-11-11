import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { auditLog } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeAuthChain } from "./helpers.ts";
import { harness, walletKey, type Harness } from "./auth-helpers.ts";

const ALICE = "alice.testnet";
const aliceKey = walletKey(1);
const MIN = 60_000;

let t: TestDb;
let h: Harness;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await h?.close();
  h = harness(
    t.db,
    fakeAuthChain({ [ALICE]: { [aliceKey.publicKey]: "full_access" } }, { [ALICE]: ["pauser"] }),
  );
});

const code = (body: unknown) => ApiErrorSchema.parse(body).code;
const audits = async () => (await t.db.select().from(auditLog)).map((r) => r.action);

describe("sessions", () => {
  it("lasts 15 minutes from the last use, and ends when idle for longer", async () => {
    const s = await h.signIn(ALICE, aliceKey);
    h.clock.now = new Date(h.clock.now.getTime() + 14 * MIN);
    const me = ENDPOINTS.authMe.response.parse((await h.get("/v1/auth/me", s.token)).json());
    expect(me.expiresAt).toBe(new Date(h.clock.now.getTime() + 15 * MIN).toISOString());
    h.clock.now = new Date(h.clock.now.getTime() + 14 * MIN);
    expect((await h.get("/v1/auth/me", s.token)).statusCode).toBe(200);
    h.clock.now = new Date(h.clock.now.getTime() + 15 * MIN);
    const gone = await h.get("/v1/auth/me", s.token);
    expect(gone.statusCode).toBe(401);
    expect(code(gone.json())).toBe("UNAUTHORIZED");
  });

  it("never renews past 8 hours, however busy", async () => {
    const s = await h.signIn(ALICE, aliceKey);
    const start = h.clock.now.getTime();
    let last = "";
    for (let i = 1; i <= 36; i++) {
      h.clock.now = new Date(start + Math.min(i * 14 * MIN, 8 * 60 * MIN - MIN));
      const res = await h.get("/v1/auth/me", s.token);
      expect(res.statusCode).toBe(200);
      last = ENDPOINTS.authMe.response.parse(res.json()).expiresAt;
    }
    expect(last).toBe(new Date(start + 8 * 60 * MIN).toISOString());
    h.clock.now = new Date(start + 8 * 60 * MIN);
    expect((await h.get("/v1/auth/me", s.token)).statusCode).toBe(401);
  });

  it("ends at once on logout, and audits it", async () => {
    const s = await h.signIn(ALICE, aliceKey);
    const out = await h.post("/v1/auth/logout", s.token);
    expect(out.statusCode).toBe(200);
    expect(ENDPOINTS.authLogout.response.parse(out.json())).toEqual({ revoked: true });
    expect((await h.get("/v1/auth/me", s.token)).statusCode).toBe(401);
    expect((await h.post("/v1/auth/logout", s.token)).statusCode).toBe(401);
    expect(await audits()).toContain("auth.logout");
  });

  it("refuses a missing, malformed or invented token", async () => {
    for (const token of [undefined, "nope", "A".repeat(43)]) {
      expect((await h.get("/v1/auth/me", token)).statusCode).toBe(401);
    }
  });
});
