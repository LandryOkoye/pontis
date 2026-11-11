// The custody, reserve, terms and reliability reads (ADR 0020 section 10): live chain views
// reshaped for the wire, labelled `simulated` with their `sources`, 404 for unknown records.

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { fixtureSource } from "@pontis/near-client/fixtures";
import {
  fixtureCustodian,
  fixtureReserveRecord,
  fixtureReserveStatus,
  fixtureRedemptionTerms,
} from "@pontis/near-client/fixtures";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import type { CustodyRepository } from "../src/custody/chain.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { fixtureRepo } from "./custody-helpers.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
const apps: FastifyInstance[] = [];
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await t.drop();
});

// The status record's own time: 30 s after the attestation's `as_of_ms`.
const NOW = new Date(fixtureReserveRecord.as_of_ms + 30_000);
const appWith = (over: Partial<CustodyRepository> = {}) => {
  const app = buildApp({ ...testAppDeps(t.db), custodyChain: fixtureRepo(over), now: () => NOW });
  apps.push(app);
  return app;
};
const get = (app: FastifyInstance, url: string) => app.inject({ method: "GET", url });
const errorOf = (res: { json: () => unknown }) => ApiErrorSchema.parse(res.json());

describe("custodians", () => {
  it("lists them with the registrar's labels and the stored status", async () => {
    const res = await get(appWith(), "/v1/custodians");
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.listCustodians.response.parse(res.json());
    expect(body).toMatchObject({ total: 1, nextCursor: null, simulated: true });
    expect(body.sources).toEqual(["registrar_entry"]);
    expect(body.items[0]).toMatchObject({
      id: "vault-co-sim",
      attesterKey: fixtureCustodian.attester_key,
      synthetic: true,
      verificationStatus: "unverified",
    });
  });

  it("pages forward with a cursor bound to the query", async () => {
    const two = [fixtureCustodian, { ...fixtureCustodian, id: "vault-co-two" }];
    const app = appWith({
      getCustodians: async (from, limit) => ({ items: two.slice(from, from + limit), total: 2 }),
    });
    const first = ENDPOINTS.listCustodians.response.parse(
      (await get(app, "/v1/custodians?limit=1")).json(),
    );
    expect(first.items.map((c) => c.id)).toEqual(["vault-co-sim"]);
    expect(first.nextCursor).not.toBeNull();
    const second = ENDPOINTS.listCustodians.response.parse(
      (await get(app, `/v1/custodians?limit=1&cursor=${first.nextCursor}`)).json(),
    );
    expect(second.items.map((c) => c.id)).toEqual(["vault-co-two"]);
    expect(second.nextCursor).toBeNull();
  });

  it("returns one, 404 for an unknown id and 400 for a bad limit", async () => {
    const app = appWith();
    expect((await get(app, "/v1/custodians/vault-co-sim")).statusCode).toBe(200);
    const missing = await get(app, "/v1/custodians/ghost");
    expect([missing.statusCode, errorOf(missing).code]).toEqual([404, "NOT_FOUND"]);
    const bad = await get(app, "/v1/custodians?limit=0");
    expect([bad.statusCode, errorOf(bad).code]).toEqual([400, "VALIDATION_ERROR"]);
    expect((await get(app, "/v1/custodians?cursor=garbage")).statusCode).toBe(400);
  });
});

describe("asset custody", () => {
  it("shows the link, its structure and the custodians, labelled simulated", async () => {
    const res = await get(appWith(), "/v1/assets/tgold-a/custody");
    const body = ENDPOINTS.getAssetCustody.response.parse(res.json());
    expect(body).toMatchObject({ linked: true, structure: "segregated", simulated: true });
    expect(body.sources).toEqual(["registrar_entry"]);
    expect(body.custodians.map((c) => c.id)).toEqual(["vault-co-sim"]);
    expect(body.notice).toMatch(/nothing is custodied, backed, audited/i);
  });

  it("says unlinked rather than inventing a custodian", async () => {
    const body = ENDPOINTS.getAssetCustody.response.parse(
      (await get(appWith(), "/v1/assets/tgold-b/custody")).json(),
    );
    expect(body).toMatchObject({ linked: false, structure: null, custodians: [] });
  });

  it("404s an unknown asset", async () => {
    expect((await get(appWith(), "/v1/assets/ghost/custody")).statusCode).toBe(404);
  });
});

describe("asset reserves", () => {
  it("reshapes the contract's status: ratio, freshness, per-custodian attestation, labels", async () => {
    const res = await get(appWith(), "/v1/assets/tgold-a/reserves");
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.getAssetReserves.response.parse(res.json());
    expect(body).toMatchObject({
      assetId: "tgold-a",
      monitored: true,
      state: "ok",
      ratioBps: 12_500,
      ratioPercent: "125.00",
      freshness: "fresh",
      attestedUnits: "1000000000000",
      circulatingUnits: "800000000000",
      headroomUnits: "200000000000",
      restrictsConversions: false,
      simulated: true,
      sources: ["simulated_custodian"],
      policy: { action: "restrict_conversions", toleranceBps: 0, maxReserveAgeMs: 86_400_000 },
    });
    expect(body.custodians).toHaveLength(1);
    expect(body.custodians[0]).toMatchObject({
      custodianId: "vault-co-sim",
      counted: true,
      latest: {
        reportUri: fixtureReserveRecord.report_uri,
        reportHash: fixtureReserveRecord.report_hash,
        attesterKey: fixtureReserveRecord.attester_key,
        ageMs: 30_000,
        fresh: true,
        simulated: true,
        source: "simulated_custodian",
      },
    });
  });

  it("states a breach and the refusal it causes in plain words, without claiming backing", async () => {
    const breached = {
      ...fixtureReserveStatus,
      state: "breached",
      circulating_units: "2000000000000",
      ratio_bps: 5_000,
      headroom_units: "0",
      restricts_conversions: true,
    } as const;
    const body = ENDPOINTS.getAssetReserves.response.parse(
      (
        await get(
          appWith({ getReserveStatus: async () => breached }),
          "/v1/assets/tgold-a/reserves",
        )
      ).json(),
    );
    expect(body).toMatchObject({
      state: "breached",
      ratioPercent: "50.00",
      restrictsConversions: true,
    });
    expect(body.explanation).toMatch(/refused/);
    expect(JSON.stringify(body)).not.toMatch(/fully backed|is backed|audited by|verified/i);
  });

  it("marks a stale attestation and does not count a suspended custodian", async () => {
    const stale = { ...fixtureReserveStatus, state: "stale", age_ms: 90_000_000 } as const;
    const app = appWith({
      getReserveStatus: async () => stale,
      getCustodian: async () => ({ ...fixtureCustodian, status: "suspended" }),
    });
    const body = ENDPOINTS.getAssetReserves.response.parse(
      (await get(app, "/v1/assets/tgold-a/reserves")).json(),
    );
    expect(body.freshness).toBe("stale");
    expect(body.custodians[0]).toMatchObject({ custodianStatus: "suspended", counted: false });
  });

  it("an unmonitored asset has no policy, no ratio and stays labelled simulated", async () => {
    const body = ENDPOINTS.getAssetReserves.response.parse(
      (
        await get(
          appWith({
            getReserveStatus: async () => ({
              ...fixtureReserveStatus,
              monitored: false,
              state: "unmonitored",
              action: null,
              ratio_bps: null,
              oldest_as_of_ms: null,
              age_ms: null,
              simulated: false,
              sources: [],
            }),
          }),
          "/v1/assets/tgold-a/reserves",
        )
      ).json(),
    );
    expect(body).toMatchObject({
      state: "unmonitored",
      policy: null,
      ratioBps: null,
      ratioPercent: null,
      freshness: "none",
      simulated: true,
    });
    expect(body.explanation).toMatch(/no reserve policy/i);
  });

  it("404s an unknown asset", async () => {
    expect((await get(appWith(), "/v1/assets/ghost/reserves")).statusCode).toBe(404);
  });
});

describe("reserve history", () => {
  const records = Array.from({ length: 5 }, (_, seq) => ({
    ...fixtureReserveRecord,
    seq,
    as_of_ms: fixtureReserveRecord.as_of_ms + seq * 1000,
  }));
  const repo = {
    getReserveHistory: async (_id: string, from: number, limit: number) => ({
      items: records.slice(from, from + limit),
      total: records.length,
    }),
  };

  it("lists newest first, pages backwards and never repeats an item", async () => {
    const app = appWith(repo);
    const first = ENDPOINTS.getAssetReserveHistory.response.parse(
      (await get(app, "/v1/assets/tgold-a/reserves/history?limit=2")).json(),
    );
    expect(first.items.map((i) => i.seq)).toEqual([4, 3]);
    expect(first).toMatchObject({ total: 5, simulated: true, sources: ["simulated_custodian"] });
    const second = ENDPOINTS.getAssetReserveHistory.response.parse(
      (
        await get(app, `/v1/assets/tgold-a/reserves/history?limit=2&cursor=${first.nextCursor}`)
      ).json(),
    );
    expect(second.items.map((i) => i.seq)).toEqual([2, 1]);
    const third = ENDPOINTS.getAssetReserveHistory.response.parse(
      (
        await get(app, `/v1/assets/tgold-a/reserves/history?limit=2&cursor=${second.nextCursor}`)
      ).json(),
    );
    expect(third.items.map((i) => i.seq)).toEqual([0]);
    expect(third.nextCursor).toBeNull();
  });

  it("refuses a cursor from another asset's history, a bad limit, and an unknown asset", async () => {
    const app = appWith(repo);
    const first = ENDPOINTS.getAssetReserveHistory.response.parse(
      (await get(app, "/v1/assets/tgold-a/reserves/history?limit=2")).json(),
    );
    expect(
      (await get(app, `/v1/assets/tgold-b/reserves/history?cursor=${first.nextCursor}`)).statusCode,
    ).toBe(400);
    expect((await get(app, "/v1/assets/tgold-a/reserves/history?limit=101")).statusCode).toBe(400);
    expect((await get(app, "/v1/assets/ghost/reserves/history")).statusCode).toBe(404);
  });

  it("stops at the oldest entry the chain's ring still holds", async () => {
    const ring = {
      getReserveHistory: async (_id: string, from: number, limit: number) => ({
        items: Array.from({ length: limit }, (_, i) => ({
          ...fixtureReserveRecord,
          seq: from + i,
        })),
        total: 610,
      }),
    };
    const app = appWith(ring);
    const seqs: number[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/v1/assets/tgold-a/reserves/history?limit=100${cursor ? `&cursor=${cursor}` : ""}`;
      const page = ENDPOINTS.getAssetReserveHistory.response.parse((await get(app, url)).json());
      seqs.push(...page.items.map((i) => i.seq));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seqs[0]).toBe(609);
    expect(seqs.at(-1)).toBe(110);
    expect(seqs).toHaveLength(500);
  });
});

describe("redemption terms", () => {
  it("shows the enforced terms with their hash and version beside the description", async () => {
    const body = ENDPOINTS.getAssetRedemptionTerms.response.parse(
      (await get(appWith(), "/v1/assets/tgold-a/redemption-terms")).json(),
    );
    expect(body).toMatchObject({
      assetId: "tgold-a",
      version: 2,
      termsHash: fixtureRedemptionTerms.terms_hash,
      simulated: true,
      sources: ["registrar_entry"],
      terms: {
        minAmount: "1000000",
        maxAmount: null,
        feeBps: 25,
        settlementDays: 3,
        window: { alwaysOpen: true, open: true, nextOpenAt: null, anchorAt: null },
      },
    });
    expect(body.description.length).toBeGreaterThan(0);
  });

  it("computes whether a periodic window is open now and when it next opens", async () => {
    const DAY = 86_400_000;
    const periodic = {
      ...fixtureRedemptionTerms,
      terms: {
        ...fixtureRedemptionTerms.terms,
        max_amount: "9000000",
        window_anchor_ms: NOW.getTime() - 3 * DAY,
        window_length_ms: DAY,
        window_period_ms: 7 * DAY,
      },
    };
    const body = ENDPOINTS.getAssetRedemptionTerms.response.parse(
      (
        await get(
          appWith({ getRedemptionTerms: async () => periodic }),
          "/v1/assets/tgold-a/redemption-terms",
        )
      ).json(),
    );
    expect(body.terms?.maxAmount).toBe("9000000");
    expect(body.terms?.window).toMatchObject({
      alwaysOpen: false,
      open: false,
      nextOpenAt: new Date(NOW.getTime() + 4 * DAY).toISOString(),
    });
  });

  it("says there are no enforced terms yet, and 404s an unknown asset", async () => {
    const none = appWith({ getRedemptionTerms: async () => null });
    const body = ENDPOINTS.getAssetRedemptionTerms.response.parse(
      (await get(none, "/v1/assets/tgold-a/redemption-terms")).json(),
    );
    expect(body).toMatchObject({ terms: null, version: null, termsHash: null, simulated: true });
    expect((await get(none, "/v1/assets/ghost/redemption-terms")).statusCode).toBe(404);
  });
});

describe("issuer reliability", () => {
  it("derives the score from the counters and labels it simulated", async () => {
    const body = ENDPOINTS.getIssuerReliability.response.parse(
      (await get(appWith(), "/v1/issuers/synthetic-issuer-a/reliability")).json(),
    );
    expect(body).toMatchObject({
      issuerId: "synthetic-issuer-a",
      requested: 4,
      simulated: true,
      sources: ["simulated_issuer"],
      score: {
        fulfilmentRateBps: 5_000,
        acceptMissRateBps: 0,
        fulfilMissRateBps: 0,
        avgAcceptLatencyMs: 600_000,
        avgSettleLatencyMs: 129_600_000,
      },
    });
  });

  it("has no rates before any request and counts misses against the right base", async () => {
    const zero = {
      requested: 0,
      accepted: 0,
      fulfilled: 0,
      accept_misses: 0,
      accept_latency_ms_total: "0",
      settle_latency_ms_total: "0",
    };
    const base = {
      issuer_id: "synthetic-issuer-a",
      rejected: 0,
      expired: 0,
      fulfil_misses: 0,
      reclaimed: 0,
      last_miss_ms: null,
      simulated: false,
    };
    const empty = ENDPOINTS.getIssuerReliability.response.parse(
      (
        await get(
          appWith({ getIssuerReliability: async () => ({ ...base, ...zero }) }),
          "/v1/issuers/synthetic-issuer-a/reliability",
        )
      ).json(),
    );
    expect(empty.score).toEqual({
      fulfilmentRateBps: null,
      acceptMissRateBps: null,
      fulfilMissRateBps: null,
      avgAcceptLatencyMs: null,
      avgSettleLatencyMs: null,
    });
    // The chain says not simulated, the demo's issuers are: the label stays.
    expect(empty.simulated).toBe(true);
    const missed = ENDPOINTS.getIssuerReliability.response.parse(
      (
        await get(
          appWith({
            getIssuerReliability: async () => ({
              ...base,
              ...zero,
              requested: 10,
              accepted: 4,
              accept_misses: 1,
              fulfil_misses: 1,
              last_miss_ms: NOW.getTime(),
            }),
          }),
          "/v1/issuers/synthetic-issuer-a/reliability",
        )
      ).json(),
    );
    expect(missed.score).toMatchObject({ acceptMissRateBps: 1_000, fulfilMissRateBps: 2_500 });
    expect(missed.lastMissAt).toBe(NOW.toISOString());
  });

  it("404s an unknown issuer", async () => {
    expect((await get(appWith(), "/v1/issuers/ghost/reliability")).statusCode).toBe(404);
  });
});
