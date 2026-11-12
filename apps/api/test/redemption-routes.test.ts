// GET /v1/redemptions and /v1/redemptions/{id} (ADR 0020 section 7).

import { ApiErrorSchema, ENDPOINTS } from "@pontis/api-types";
import { fixtureRedemption, fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainRedemption } from "@pontis/near-client";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import type { CustodyRepository } from "../src/custody/chain.ts";
import { isReclaimable, timeline } from "../src/custody/redemptions.ts";
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

const NOW = new Date(fixtureRedemption.created_ms + 3_600_000);
const appWith = (over: Partial<CustodyRepository> = {}) => {
  const app = buildApp({ ...testAppDeps(t.db), custodyChain: fixtureRepo(over), now: () => NOW });
  apps.push(app);
  return app;
};
const get = (app: FastifyInstance, url: string) => app.inject({ method: "GET", url });
const redemption = (over: Partial<ChainRedemption>): ChainRedemption => ({
  ...fixtureRedemption,
  ...over,
});

describe("GET /v1/redemptions/{id}", () => {
  it("returns the record with its timeline and the labels", async () => {
    const res = await get(appWith(), "/v1/redemptions/1");
    expect(res.statusCode).toBe(200);
    const body = ENDPOINTS.getRedemption.response.parse(res.json());
    expect(body).toMatchObject({
      id: "1",
      assetId: "tgold-a",
      status: "accepted",
      amount: "5000000",
      feeUnits: "12500",
      netUnits: "4987500",
      reclaimable: false,
      simulated: true,
      sources: ["simulated_issuer"],
    });
    expect(body.timeline.map((e) => e.event)).toEqual(["requested", "accepted"]);
    expect(body.timeline.every((e) => e.txHash === null)).toBe(true);
    expect(body.notice).toMatch(/nothing is custodied, backed, audited/i);
  });

  it("404s an unknown id and 400s one that is not a number", async () => {
    const app = appWith();
    const missing = await get(app, "/v1/redemptions/99");
    expect([missing.statusCode, ApiErrorSchema.parse(missing.json()).code]).toEqual([
      404,
      "NOT_FOUND",
    ]);
    expect((await get(app, "/v1/redemptions/abc")).statusCode).toBe(400);
  });
});

describe("redemption timeline", () => {
  it("shows a fulfilment with its resolution time", () => {
    const r = redemption({ status: "fulfilled", resolved_ms: fixtureRedemption.created_ms + 5 });
    expect(timeline(r).map((e) => e.event)).toEqual(["requested", "accepted", "fulfilled"]);
    expect(timeline(r).at(-1)?.at).toBe(new Date(r.resolved_ms as number).toISOString());
  });

  it("shows a rejection straight from requested, with no accepted step", () => {
    const r = redemption({
      status: "rejected",
      accepted_ms: null,
      fulfil_deadline_ms: null,
      resolved_ms: 7,
      reject_reason: "kyc",
    });
    expect(timeline(r).map((e) => e.event)).toEqual(["requested", "rejected"]);
  });

  it("dates only the latest step: an expiry followed by a reclaim keeps no time of its own", () => {
    const r = redemption({ status: "reclaimed", miss: "fulfil", resolved_ms: 9 });
    const steps = timeline(r);
    expect(steps.map((e) => e.event)).toEqual(["requested", "accepted", "expired", "reclaimed"]);
    expect(steps.find((e) => e.event === "expired")?.at).toBeNull();
    expect(steps.find((e) => e.event === "reclaimed")?.at).toBe(new Date(9).toISOString());
  });
});

describe("reclaimable", () => {
  it("is true for rejected and expired, and for an open request past its deadline", () => {
    const f = fixtureRedemption;
    expect(isReclaimable(redemption({ status: "rejected" }), 0)).toBe(true);
    expect(isReclaimable(redemption({ status: "expired" }), 0)).toBe(true);
    expect(isReclaimable(redemption({ status: "requested" }), f.accept_deadline_ms + 1)).toBe(true);
    expect(isReclaimable(redemption({ status: "requested" }), f.accept_deadline_ms)).toBe(false);
    expect(isReclaimable(redemption({}), (f.fulfil_deadline_ms as number) + 1)).toBe(true);
    expect(isReclaimable(redemption({ status: "fulfilled" }), 1e15)).toBe(false);
    expect(isReclaimable(redemption({ status: "reclaimed" }), 1e15)).toBe(false);
  });
});

describe("GET /v1/redemptions", () => {
  const rows = [1, 2, 3, 4].map((id) =>
    redemption({ id, status: id % 2 === 0 ? "fulfilled" : "accepted" }),
  );
  const byUser = async (_u: string, from: number, limit: number) => ({
    items: rows.slice(from, from + limit),
    total: rows.length,
  });

  it("needs a user or an asset", async () => {
    const res = await get(appWith(), "/v1/redemptions");
    expect([res.statusCode, ApiErrorSchema.parse(res.json()).code]).toEqual([
      400,
      "VALIDATION_ERROR",
    ]);
  });

  it("lists a user's redemptions newest first, labelled, and pages", async () => {
    const app = appWith({ getRedemptionsByUser: byUser });
    const first = ENDPOINTS.listRedemptions.response.parse(
      (await get(app, "/v1/redemptions?user=alice.testnet&limit=3")).json(),
    );
    expect(first.items.map((i) => i.id)).toEqual(["4", "3", "2"]);
    expect(first).toMatchObject({ simulated: true, sources: ["simulated_issuer"] });
    const second = ENDPOINTS.listRedemptions.response.parse(
      (
        await get(app, `/v1/redemptions?user=alice.testnet&limit=3&cursor=${first.nextCursor}`)
      ).json(),
    );
    expect(second.items.map((i) => i.id)).toEqual(["1"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by status within a page, and by representation through the issuer queue view", async () => {
    const app = appWith({
      getRedemptionsByUser: byUser,
      getRedemptionsByRepresentation: async (rep, from, limit) => ({
        items: rows.slice(from, from + limit).map((r) => ({ ...r, representation_id: rep })),
        total: rows.length,
      }),
    });
    const accepted = ENDPOINTS.listRedemptions.response.parse(
      (await get(app, "/v1/redemptions?user=alice.testnet&status=accepted")).json(),
    );
    expect(accepted.items.map((i) => i.id)).toEqual(["3", "1"]);
    const queue = ENDPOINTS.listRedemptions.response.parse(
      (await get(app, "/v1/redemptions?representationId=tgold-a&status=fulfilled")).json(),
    );
    expect(queue.items.map((i) => i.id)).toEqual(["4", "2"]);
  });

  it("combines a user and an asset by filtering the user's list", async () => {
    const app = appWith({
      getRedemptionsByUser: async () => ({
        items: [redemption({ id: 1 }), redemption({ id: 2, representation_id: "tgold-b" })],
        total: 2,
      }),
    });
    const body = ENDPOINTS.listRedemptions.response.parse(
      (await get(app, "/v1/redemptions?user=alice.testnet&representationId=tgold-b")).json(),
    );
    expect(body.items.map((i) => i.id)).toEqual(["2"]);
  });

  it("404s an unknown asset, 400s a bad status or limit or a replayed cursor", async () => {
    const app = appWith({ getRedemptionsByUser: byUser });
    expect((await get(app, "/v1/redemptions?representationId=ghost")).statusCode).toBe(404);
    expect((await get(app, "/v1/redemptions?user=alice.testnet&status=paid")).statusCode).toBe(400);
    expect((await get(app, "/v1/redemptions?user=alice.testnet&limit=0")).statusCode).toBe(400);
    const first = ENDPOINTS.listRedemptions.response.parse(
      (await get(app, "/v1/redemptions?user=alice.testnet&limit=2")).json(),
    );
    expect(
      (await get(app, `/v1/redemptions?user=bob.testnet&limit=2&cursor=${first.nextCursor}`))
        .statusCode,
    ).toBe(400);
  });

  it("returns an empty page for a user with none", async () => {
    const body = ENDPOINTS.listRedemptions.response.parse(
      (
        await get(
          appWith({ getRedemptionsByUser: async () => ({ items: [], total: 0 }) }),
          "/v1/redemptions?user=nobody.testnet",
        )
      ).json(),
    );
    expect(body).toMatchObject({ items: [], nextCursor: null });
  });
});
