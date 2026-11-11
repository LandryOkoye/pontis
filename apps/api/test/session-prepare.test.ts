// POST /v1/redemptions/prepare (ADR 0020 sections 7 and 10).

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { redemptionPayoutInstructions } from "@pontis/db";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import { fixtureSource } from "@pontis/near-client/fixtures";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Harness } from "./auth-helpers.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { auditRows, call, NOW, sessionHarness, terms, tokenFor } from "./session-helpers.ts";

// bytes 0..31; sha256 computed independently in Python:
//   python3 -c "import hashlib;print(hashlib.sha256(bytes(range(32))).hexdigest())"
const CIPHERTEXT = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const CIPHERTEXT_SHA256 = "630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd";
const TERMS_HASH = "c".repeat(64);

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

const body = (over: Record<string, unknown> = {}) => ({
  representationId: "tgold-a",
  amount: "5000000",
  payoutInstruction: CIPHERTEXT,
  ...over,
});
const stored = async () => t.db.select().from(redemptionPayoutInstructions);

async function prepare(payload: unknown, who: "alice" | "bo" = "alice") {
  return call(h, "POST", "/v1/redemptions/prepare", await tokenFor(h, who), payload);
}

beforeEach(async () => {
  await h?.close();
  h = sessionHarness(t.db);
});

describe("POST /v1/redemptions/prepare", () => {
  it("returns the redeem message, the hashes and one unsigned ft_transfer_call for the session account", async () => {
    const res = await prepare(body());
    expect(res.statusCode).toBe(201);
    const out = ENDPOINTS.prepareRedemption.response.parse(res.json());
    expect(out).toMatchObject({
      representationId: "tgold-a",
      amount: "5000000",
      termsHash: TERMS_HASH,
      termsVersion: 2,
      payoutInstructionHash: CIPHERTEXT_SHA256,
      msg: `redeem:${TERMS_HASH}:${CIPHERTEXT_SHA256}`,
      feeUnits: "12500",
      netUnits: "4987500",
      simulated: true,
      sources: ["simulated_issuer"],
    });
    expect(out.actions).toEqual([
      {
        receiverId: "tgold-a.pontis.testnet",
        methodName: "ft_transfer_call",
        args: { receiver_id: "core.testnet", amount: "5000000", msg: out.msg },
        gas: "100000000000000",
        deposit: "1",
      },
    ]);
  });

  it("stores the ciphertext exactly as sent, for the session account, under the prepare id", async () => {
    const before = (await stored()).length;
    const out = ENDPOINTS.prepareRedemption.response.parse((await prepare(body())).json());
    const rows = (await stored()).filter((r) => r.id === out.prepareId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId: "alice.testnet",
      representationId: "tgold-a",
      amount: "5000000",
      termsHash: TERMS_HASH,
      payoutInstructionHash: CIPHERTEXT_SHA256,
      ciphertext: CIPHERTEXT,
      redemptionId: null,
    });
    expect((await stored()).length).toBe(before + 1);
  });

  it("never returns the instruction, and the audit row holds only its hash", async () => {
    const res = await prepare(body());
    expect(res.body).not.toContain(CIPHERTEXT);
    const rows = await auditRows(t.db);
    const row = rows.find((r) => r.action === "session.redemption.prepare");
    expect(row).toMatchObject({ actor: "alice.testnet", subject: "/v1/redemptions/prepare" });
    expect(row?.detail).toMatchObject({
      payoutInstructionHash: CIPHERTEXT_SHA256,
      amount: "5000000",
    });
    expect(JSON.stringify(rows)).not.toContain(CIPHERTEXT);
  });

  it("rounds the fee up, as the contract does", async () => {
    const odd = await prepare(body({ amount: "1000001" }));
    expect(odd.json()).toMatchObject({ feeUnits: "2501", netUnits: "997500" });
  });

  it("accepts a termsHash that is still current", async () => {
    expect((await prepare(body({ termsHash: TERMS_HASH }))).statusCode).toBe(201);
  });

  it("refuses a terms hash the user saw before the terms changed (409 REDEMPTION_TERMS_CHANGED), storing nothing", async () => {
    const before = (await stored()).length;
    const res = await prepare(body({ termsHash: "e".repeat(64) }));
    expect(res.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("REDEMPTION_TERMS_CHANGED");
    expect((await stored()).length).toBe(before);
  });

  it.each([
    ["below the minimum", { amount: "999999" }, {}, "REDEMPTION_BELOW_MIN"],
    ["above the maximum", { amount: "9000001" }, { max_amount: "9000000" }, "REDEMPTION_ABOVE_MAX"],
  ])("%s", async (_name, over, termsOver, code) => {
    h = sessionHarness(t.db, { getRedemptionTerms: async () => terms(termsOver) });
    const res = await prepare(body(over));
    expect(res.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(res.json()).code).toBe(code);
  });

  it("accepts exactly the minimum and exactly the maximum", async () => {
    h = sessionHarness(t.db, { getRedemptionTerms: async () => terms({ max_amount: "9000000" }) });
    expect((await prepare(body({ amount: "1000000" }))).statusCode).toBe(201);
    expect((await prepare(body({ amount: "9000000" }))).statusCode).toBe(201);
  });

  it("refuses outside the redemption window (409 REDEMPTION_WINDOW_CLOSED) and says when it reopens", async () => {
    const hour = 3_600_000;
    const anchor = NOW.getTime() - 5 * hour; // five hours into a window that is open for one hour a day
    h = sessionHarness(t.db, {
      getRedemptionTerms: async () =>
        terms({ window_anchor_ms: anchor, window_length_ms: hour, window_period_ms: 24 * hour }),
    });
    const res = await prepare(body());
    expect(res.statusCode).toBe(409);
    const err = ApiErrorSchema.parse(res.json());
    expect(err.code).toBe("REDEMPTION_WINDOW_CLOSED");
    expect(err.message).toMatch(/opens next at 20\d\d-/);
  });

  it("allows a request inside an open window", async () => {
    const hour = 3_600_000;
    const anchor = NOW.getTime() - 10 * 60_000; // opened ten minutes ago, open for an hour
    h = sessionHarness(t.db, {
      getRedemptionTerms: async () =>
        terms({ window_anchor_ms: anchor, window_length_ms: hour, window_period_ms: 24 * hour }),
    });
    expect((await prepare(body())).statusCode).toBe(201);
  });

  it("404s an unknown asset and an asset with no enforced terms, and 422s a paused one", async () => {
    expect((await prepare(body({ representationId: "nope" }))).statusCode).toBe(404);
    h = sessionHarness(t.db, { getRedemptionTerms: async () => null });
    const none = await prepare(body());
    expect(none.statusCode).toBe(404);
    expect(none.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(none.json().message).toMatch(/no enforced redemption terms/);
    h = sessionHarness(t.db, {
      getRepresentation: async (id) => {
        const reps = (await import("@pontis/near-client/fixtures")).representations;
        const rep = reps.find((r) => r.id === id);
        return rep ? { ...rep, status: "paused" } : null;
      },
    });
    const paused = await prepare(body());
    expect(paused.statusCode).toBe(422);
    expect(paused.json()).toMatchObject({ code: "ASSET_PAUSED" });
  });

  it("lets a restricted asset be redeemed: exits stay open", async () => {
    h = sessionHarness(t.db, {
      getRepresentation: async (id) => {
        const reps = (await import("@pontis/near-client/fixtures")).representations;
        const rep = reps.find((r) => r.id === id);
        return rep ? { ...rep, status: "restricted" } : null;
      },
    });
    expect((await prepare(body())).statusCode).toBe(201);
  });

  it.each([
    ["a zero amount", { amount: "0" }],
    ["a decimal amount", { amount: "1.5" }],
    ["a plain-text instruction", { payoutInstruction: "IBAN CH93" }],
    [
      "base64 that is not canonical",
      { payoutInstruction: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh9=" },
    ],
    ["an oversized instruction", { payoutInstruction: "A".repeat(5_900) }],
    ["an unknown field", { note: "hi" }],
    ["a missing asset", { representationId: undefined }],
  ])("400s %s and stores nothing", async (_name, over) => {
    const before = (await stored()).length;
    const res = await prepare(body(over));
    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).code).toBe("VALIDATION_ERROR");
    expect((await stored()).length).toBe(before);
  });

  it("401s without a session, with a bogus token and with the break-glass key", async () => {
    for (const token of [undefined, "nonsense", "0123456789abcdef-legacy-key"]) {
      const res = await call(h, "POST", "/v1/redemptions/prepare", token, body());
      expect(res.statusCode, String(token)).toBe(401);
      expect(ApiErrorSchema.parse(res.json()).code).toBe("UNAUTHORIZED");
    }
  });

  it("lets any signed-in account redeem for itself: there is no role gate, the session account is the redeemer", async () => {
    const res = await prepare(body(), "bo");
    expect(res.statusCode).toBe(201);
    const rows = (await stored()).filter((r) => r.accountId === "issuer-bo.testnet");
    expect(rows).toHaveLength(1);
  });
});
