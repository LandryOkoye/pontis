import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { auditLog, authChallenges, authSessions } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeAuthChain } from "./helpers.ts";
import { harness, walletKey, type Harness } from "./auth-helpers.ts";

const ALICE = "alice.testnet";
const aliceKey = walletKey(1);
const otherKey = walletKey(2);
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

describe("POST /v1/auth/challenge", () => {
  it("returns 32 random bytes, the recipient, a message naming the account, and a 5 minute expiry", async () => {
    const c = await h.challenge(ALICE);
    expect(Buffer.from(c.nonce, "base64")).toHaveLength(32);
    expect(c.recipient).toBe("pontis-api.test");
    expect(c.message).toContain(ALICE);
    expect(c.message).toContain("never a transaction");
    expect(c.expiresAt).toBe(new Date(h.clock.now.getTime() + 5 * MIN).toISOString());
    expect((await h.challenge(ALICE)).nonce).not.toBe(c.nonce);
  });

  it("refuses an invalid account id with a validation error", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/auth/challenge",
      payload: { accountId: "Not An Account" },
    });
    expect(res.statusCode).toBe(400);
    expect(code(res.json())).toBe("VALIDATION_ERROR");
  });

  it("is never cached", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/auth/challenge",
      payload: { accountId: ALICE },
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("POST /v1/auth/verify", () => {
  it("opens a session whose roles come from the chain, and records the key type", async () => {
    const s = await h.signIn(ALICE, aliceKey);
    expect(s).toMatchObject({
      tokenType: "Bearer",
      accountId: ALICE,
      roles: ["pauser"],
      keyType: "full_access",
      expiresAt: new Date(h.clock.now.getTime() + 15 * MIN).toISOString(),
      maxExpiresAt: new Date(h.clock.now.getTime() + 8 * 60 * MIN).toISOString(),
    });
    const me = await h.get("/v1/auth/me", s.token);
    expect(ENDPOINTS.authMe.response.parse(me.json())).toMatchObject({
      accountId: ALICE,
      roles: ["pauser"],
    });
  });

  it("stores only a hash of the token, and audits the sign-in under the account and key", async () => {
    const s = await h.signIn(ALICE, aliceKey);
    const sessions = await t.db.select().from(authSessions);
    expect(JSON.stringify(sessions)).not.toContain(s.token);
    expect(sessions.some((r) => r.tokenHash.length === 64 && r.accountId === ALICE)).toBe(true);
    const row = (await t.db.select().from(auditLog)).find((r) => r.action === "auth.sign_in");
    expect(row).toMatchObject({ actor: ALICE, actorKey: aliceKey.publicKey });
    expect(JSON.stringify(row)).not.toContain(s.token);
  });

  it("accepts a function-call key as proof of ownership and records that it was one", async () => {
    h.chain.keys[ALICE] = { ...h.chain.keys[ALICE], [otherKey.publicKey]: "function_call" };
    const s = await h.signIn(ALICE, otherKey);
    expect(s.keyType).toBe("function_call");
    const stored = await t.db.select().from(authSessions);
    expect(stored.find((r) => r.publicKey === otherKey.publicKey)?.keyType).toBe("function_call");
  });

  it("lets an account with no roles sign in, with an empty role list", async () => {
    h.chain.roles[ALICE] = [];
    expect((await h.signIn(ALICE, aliceKey)).roles).toEqual([]);
  });

  it("drops role names it does not know", async () => {
    h.chain.roles[ALICE] = ["owner", "future_role", "owner"];
    expect((await h.signIn(ALICE, aliceKey)).roles).toEqual(["owner"]);
  });

  it("accepts a nonce once: replaying the same signed message is refused", async () => {
    const c = await h.challenge(ALICE);
    expect((await h.verify(c, aliceKey)).status).toBe(200);
    const replay = await h.verify(c, aliceKey);
    expect(replay.status).toBe(401);
    expect(code(replay.body)).toBe("UNAUTHORIZED");
    const [row] = await t.db.select().from(authChallenges).where(eq(authChallenges.nonce, c.nonce));
    expect(row?.consumedAt).not.toBeNull();
  });

  it("lets exactly one of two concurrent verifies of one challenge through", async () => {
    const c = await h.challenge(ALICE);
    const results = await Promise.all([h.verify(c, aliceKey), h.verify(c, aliceKey)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("refuses a challenge older than 5 minutes", async () => {
    const c = await h.challenge(ALICE);
    h.clock.now = new Date(h.clock.now.getTime() + 5 * MIN);
    expect((await h.verify(c, aliceKey)).status).toBe(401);
  });

  it("accepts a challenge just inside the 5 minutes", async () => {
    const c = await h.challenge(ALICE);
    h.clock.now = new Date(h.clock.now.getTime() + 5 * MIN - 1);
    expect((await h.verify(c, aliceKey)).status).toBe(200);
  });

  it("refuses a nonce the server never issued, and one issued for another account", async () => {
    const c = await h.challenge(ALICE);
    expect(
      (await h.verify({ ...c, nonce: Buffer.alloc(32, 7).toString("base64") }, aliceKey)).status,
    ).toBe(401);
    expect((await h.verify(c, aliceKey, { accountId: "bob.testnet" })).status).toBe(401);
  });

  it("refuses a signature by a different key than the one claimed", async () => {
    const c = await h.challenge(ALICE);
    const res = await h.app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: {
        accountId: ALICE,
        publicKey: aliceKey.publicKey,
        // Signed by otherKey, claimed as alice's key.
        signature: Buffer.alloc(64, 3).toString("base64"),
        nonce: c.nonce,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(await audits()).toContain("auth.sign_in_failed");
  });

  it("refuses a key that is not an access key of the account, and keeps the nonce for a retry", async () => {
    const c = await h.challenge(ALICE);
    const bad = await h.verify(c, otherKey);
    expect(bad.status).toBe(401);
    expect(JSON.stringify(bad.body)).toContain("not an access key");
    expect((await h.verify(c, aliceKey)).status).toBe(200);
  });

  it("refuses a signature made over a different message", async () => {
    const c = await h.challenge(ALICE);
    expect((await h.verify({ ...c, message: `${c.message} (edited)` }, aliceKey)).status).toBe(401);
  });

  it("needs the callback URL the wallet signed over, and refuses a different one", async () => {
    const c = await h.challenge(ALICE);
    expect(
      (await h.verify(c, aliceKey, { signedCallbackUrl: "https://app.example/cb" })).status,
    ).toBe(401);
    expect(
      (
        await h.verify(c, aliceKey, {
          callbackUrl: "https://app.example/cb",
          signedCallbackUrl: "https://evil.example",
        })
      ).status,
    ).toBe(401);
    expect((await h.verify(c, aliceKey, { callbackUrl: "https://app.example/cb" })).status).toBe(
      200,
    );
  });

  it("records each refusal with the reason, never the signature", async () => {
    const c = await h.challenge(ALICE);
    await h.verify(c, otherKey);
    const rows = (await t.db.select().from(auditLog)).filter(
      (r) => r.action === "auth.sign_in_failed",
    );
    expect(rows.at(-1)?.detail).toEqual({ accountId: ALICE, reason: "key" });
    expect(rows.at(-1)?.actor).toBe("anonymous");
  });
});
