// GET /v1/admin/reserve-monitor (ADR 0020 section 10).

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { auditLog, storeReserveMonitorReport, type ReserveMonitorReport } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_POLICY, OPERATOR_ROLES } from "../src/auth/policy.ts";
import { harness, walletKey, type Harness } from "./auth-helpers.ts";
import { fakeAuthChain } from "./helpers.ts";

const LEGACY = "0123456789abcdef-legacy-key";
const people = {
  owen: { id: "owen.testnet", key: walletKey(31), roles: ["owner"] },
  pat: { id: "pat.testnet", key: walletKey(32), roles: ["pauser"] },
  ada: { id: "ada.testnet", key: walletKey(33), roles: ["reserve_attester"] },
  nobody: { id: "nobody.testnet", key: walletKey(34), roles: [] as string[] },
};
const URL = "/v1/admin/reserve-monitor";

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
  h = harness(
    t.db,
    fakeAuthChain(
      Object.fromEntries(
        Object.values(people).map((p) => [p.id, { [p.key.publicKey]: "full_access" as const }]),
      ),
      Object.fromEntries(Object.values(people).map((p) => [p.id, p.roles])),
    ),
    { adminApiKey: LEGACY },
  );
});

const entry = (over: Partial<ReserveMonitorReport["entries"][number]> = {}) => ({
  representationId: "tgold-a",
  state: "ok" as const,
  action: "restrict_conversions" as const,
  attestedUnits: "1000",
  circulatingUnits: "500",
  limitUnits: "1000",
  ratioBps: 20_000,
  ageMs: 5,
  maxReserveAgeMs: 86_400_000,
  refreshedSupply: true,
  evaluated: true,
  simulated: true,
  sources: ["simulated_custodian"],
  error: null,
  ...over,
});
const report = (over: Partial<ReserveMonitorReport> = {}): ReserveMonitorReport => ({
  ranAt: "2026-11-11T12:00:00.000Z",
  signer: "monitor.testnet",
  simulated: true,
  source: "reserve_monitor",
  entries: [entry()],
  breaches: [],
  stale: [],
  failed: [],
  ...over,
});
const get = (token?: string) => h.get(URL, token);

describe("GET /v1/admin/reserve-monitor", () => {
  it("is an operator-only admin endpoint in the policy table, read fresh from the chain like reconciliation", () => {
    expect(ADMIN_POLICY.getReserveMonitor.roles).toEqual([...OPERATOR_ROLES]);
    expect(ADMIN_POLICY.getReserveMonitor.sensitive).toBe(true);
    expect(ENDPOINTS.getReserveMonitor.tag).toBe("Admin");
  });

  it("says NEVER_RUN before the indexer's monitor has stored a pass", async () => {
    const s = await h.signIn(people.owen.id, people.owen.key);
    const res = await get(s.token);
    expect(res.statusCode).toBe(200);
    expect(ENDPOINTS.getReserveMonitor.response.parse(res.json())).toMatchObject({
      status: "NEVER_RUN",
      ranAt: null,
      entries: [],
      simulated: true,
      source: "reserve_monitor",
    });
  });

  it("serves the stored pass: OK when nothing is breached, stale or failed", async () => {
    await storeReserveMonitorReport(t.db, report());
    const s = await h.signIn(people.pat.id, people.pat.key);
    const body = ENDPOINTS.getReserveMonitor.response.parse((await get(s.token)).json());
    expect(body).toMatchObject({
      status: "OK",
      signer: "monitor.testnet",
      ranAt: "2026-11-11T12:00:00.000Z",
    });
    expect(body.entries[0]).toMatchObject({
      representationId: "tgold-a",
      state: "ok",
      ratioBps: 20_000,
    });
    expect(body.notice).toMatch(/simulated/i);
  });

  it.each([
    ["a breach", { breaches: ["tgold-a"] }],
    ["a stale reserve", { stale: ["tgold-a"] }],
    ["a failed read", { failed: ["tgold-a"] }],
  ])("says ATTENTION for %s", async (_n, over) => {
    await storeReserveMonitorReport(t.db, report(over));
    const s = await h.signIn(people.owen.id, people.owen.key);
    expect((await get(s.token)).json().status).toBe("ATTENTION");
  });

  it("reports a read-only monitor as signer null", async () => {
    await storeReserveMonitorReport(t.db, report({ signer: null }));
    const s = await h.signIn(people.owen.id, people.owen.key);
    expect((await get(s.token)).json().signer).toBeNull();
  });

  it("401s without a credential, 403s an account with no operator role and an attester, admits the break-glass key", async () => {
    expect((await get()).statusCode).toBe(401);
    expect((await get("nonsense")).statusCode).toBe(401);
    for (const who of ["nobody", "ada"] as const) {
      const s = await h.signIn(people[who].id, people[who].key);
      const res = await get(s.token);
      expect(res.statusCode, who).toBe(403);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("FORBIDDEN");
    }
    expect((await get(LEGACY)).statusCode).toBe(200);
  });

  it("audits allowed and refused calls", async () => {
    const owner = await h.signIn(people.owen.id, people.owen.key);
    await get(owner.token);
    const stranger = await h.signIn(people.nobody.id, people.nobody.key);
    await get(stranger.token);
    const rows = (await t.db.select().from(auditLog)).filter((r) => r.subject === URL);
    expect(rows.map((r) => [r.actor, r.action]).sort()).toEqual([
      ["nobody.testnet", "admin.forbidden"],
      ["owen.testnet", "admin.reserve_monitor.read"],
    ]);
  });
});
