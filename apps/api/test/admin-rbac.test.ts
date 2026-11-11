import { ApiErrorSchema, ENDPOINTS, type OperationId } from "@pontis/api-types";
import { auditLog } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_POLICY, OPERATOR_ROLES } from "../src/auth/policy.ts";
import { harness, walletKey, type Harness } from "./auth-helpers.ts";
import { fakeAuthChain } from "./helpers.ts";

const LEGACY = "0123456789abcdef-legacy-key";
const people = {
  owen: { id: "owen.testnet", key: walletKey(11) },
  pat: { id: "pat.testnet", key: walletKey(12) },
  ada: { id: "ada.testnet", key: walletKey(13) },
  nobody: { id: "nobody.testnet", key: walletKey(14) },
};
const SEC = 1000;

let t: TestDb;
let h: Harness;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await h?.close();
  await t.drop();
});
beforeEach(async () => {
  await h?.close();
  await t.db.delete(auditLog);
  const keys = Object.fromEntries(
    Object.values(people).map((p) => [p.id, { [p.key.publicKey]: "full_access" as const }]),
  );
  h = harness(
    t.db,
    fakeAuthChain(keys, {
      [people.owen.id]: ["owner"],
      [people.pat.id]: ["pauser"],
      [people.ada.id]: ["attester", "bridge_attester"],
    }),
    { adminApiKey: LEGACY },
  );
});

const ADMIN_URLS = ["/v1/admin/reconciliation", "/v1/admin/metrics", "/metrics"];
const audit = async () =>
  (await t.db.select().from(auditLog)).map((r) => ({
    actor: r.actor,
    key: r.actorKey,
    action: r.action,
    subject: r.subject,
  }));

describe("the policy table", () => {
  it("covers every admin endpoint and no other, and names only the operator roles", () => {
    const adminOps = (Object.keys(ENDPOINTS) as OperationId[]).filter(
      (op) => ENDPOINTS[op].tag === "Admin",
    );
    expect(Object.keys(ADMIN_POLICY).sort()).toEqual([...adminOps].sort());
    for (const policy of Object.values(ADMIN_POLICY)) {
      expect([...policy.roles]).toEqual([...OPERATOR_ROLES]);
      expect(policy.roles).not.toContain("attester");
    }
  });

  it("marks the reconciliation read sensitive and the read-only metrics not", () => {
    expect(ADMIN_POLICY.getReconciliation.sensitive).toBe(true);
    expect(ADMIN_POLICY.getAdminMetrics.sensitive).toBe(false);
  });
});

describe("admin endpoints with a wallet session", () => {
  it.each(["owen", "pat"] as const)("admits %s, who holds an operator role", async (who) => {
    const s = await h.signIn(people[who].id, people[who].key);
    for (const url of ADMIN_URLS) {
      expect((await h.get(url, s.token)).statusCode, url).toBe(200);
    }
  });

  it("refuses an account with no role (403 FORBIDDEN) and one with attester roles only", async () => {
    for (const who of ["nobody", "ada"] as const) {
      const s = await h.signIn(people[who].id, people[who].key);
      for (const url of ADMIN_URLS) {
        const res = await h.get(url, s.token);
        expect([who, url, res.statusCode]).toEqual([who, url, 403]);
        expect(ApiErrorSchema.parse(res.json()).code).toBe("FORBIDDEN");
      }
      // Signed in, so the session itself still works.
      expect((await h.get("/v1/auth/me", s.token)).statusCode).toBe(200);
    }
  });

  it("refuses no credential, an invented token and a logged-out session with 401", async () => {
    const s = await h.signIn(people.owen.id, people.owen.key);
    await h.post("/v1/auth/logout", s.token);
    for (const token of [undefined, "invented", s.token]) {
      const res = await h.get("/v1/admin/reconciliation", token);
      expect(res.statusCode).toBe(401);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("UNAUTHORIZED");
    }
  });

  it("audits the account and the key, and the refusal as admin.forbidden", async () => {
    const s = await h.signIn(people.pat.id, people.pat.key);
    await h.get("/v1/admin/metrics", s.token);
    const n = await h.signIn(people.nobody.id, people.nobody.key);
    await h.get("/v1/admin/metrics", n.token);
    const rows = await audit();
    expect(rows).toContainEqual({
      actor: people.pat.id,
      key: people.pat.key.publicKey,
      action: "admin.metrics.read",
      subject: "/v1/admin/metrics",
    });
    expect(rows).toContainEqual({
      actor: people.nobody.id,
      key: people.nobody.key.publicKey,
      action: "admin.forbidden",
      subject: "/v1/admin/metrics",
    });
  });
});

describe("role caching", () => {
  it("serves a non-sensitive endpoint from the 60 second cache, then re-reads the chain", async () => {
    const s = await h.signIn(people.pat.id, people.pat.key);
    expect(h.chain.reads[people.pat.id]).toBe(1);
    h.chain.roles[people.pat.id] = [];
    h.clock.now = new Date(h.clock.now.getTime() + 59 * SEC);
    // Cached: the revoked pauser still reads metrics until the cache runs out.
    expect((await h.get("/v1/admin/metrics", s.token)).statusCode).toBe(200);
    expect(h.chain.reads[people.pat.id]).toBe(1);
    h.clock.now = new Date(h.clock.now.getTime() + 2 * SEC);
    expect((await h.get("/v1/admin/metrics", s.token)).statusCode).toBe(403);
    expect(h.chain.reads[people.pat.id]).toBe(2);
  });

  it("re-reads the chain on every sensitive request, so a revoked role stops at once", async () => {
    const s = await h.signIn(people.pat.id, people.pat.key);
    expect((await h.get("/v1/admin/reconciliation", s.token)).statusCode).toBe(200);
    expect((await h.get("/v1/admin/reconciliation", s.token)).statusCode).toBe(200);
    expect(h.chain.reads[people.pat.id]).toBe(3);
    h.chain.roles[people.pat.id] = [];
    expect((await h.get("/v1/admin/reconciliation", s.token)).statusCode).toBe(403);
  });

  it("picks up a granted role as soon as the cache is old", async () => {
    const s = await h.signIn(people.nobody.id, people.nobody.key);
    expect((await h.get("/v1/admin/metrics", s.token)).statusCode).toBe(403);
    h.chain.roles[people.nobody.id] = ["registrar"];
    h.clock.now = new Date(h.clock.now.getTime() + 61 * SEC);
    expect((await h.get("/v1/admin/metrics", s.token)).statusCode).toBe(200);
    const me = await h.get("/v1/auth/me", s.token);
    expect(me.json()).toMatchObject({ roles: ["registrar"] });
  });

  it("fails the request, not open, when the chain cannot be read for a sensitive call", async () => {
    const s = await h.signIn(people.owen.id, people.owen.key);
    h.chain.chain.getAccountRoles = async () => {
      throw new Error("rpc down");
    };
    const res = await h.get("/v1/admin/reconciliation", s.token);
    expect(res.statusCode).toBe(500);
  });
});

describe("the break-glass admin key", () => {
  it("still works on every admin endpoint, audited as legacy-admin-key with no account key", async () => {
    for (const url of ADMIN_URLS) expect((await h.get(url, LEGACY)).statusCode, url).toBe(200);
    const rows = await audit();
    expect(rows.filter((r) => r.actor === "legacy-admin-key")).toHaveLength(3);
    expect(rows.every((r) => r.key === null)).toBe(true);
  });

  it("is no session: it cannot use /v1/auth/me or log out", async () => {
    expect((await h.get("/v1/auth/me", LEGACY)).statusCode).toBe(401);
    expect((await h.post("/v1/auth/logout", LEGACY)).statusCode).toBe(401);
  });

  it("is off when unset: the same string is refused", async () => {
    const off = harness(t.db);
    expect((await off.get("/v1/admin/reconciliation", LEGACY)).statusCode).toBe(401);
    await off.close();
  });
});
