// The lifecycle, corporate action and NAV endpoints (ADR 0017, ADR 0018): read live from the
// chain, reshaped for the wire, with the chain's labels passed through.

import { fixtureSource } from "@pontis/near-client/fixtures";
import type { ChainCorporateAction, ChainLifecycle, ChainNavStrike } from "@pontis/near-client";
import { createTestDb, type TestDb } from "@pontis/db/testing";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActionsChain } from "../src/actions/chain.ts";
import { buildApp } from "../src/app.ts";
import { syncRegistry } from "../src/sync/registry-sync.ts";
import { testAppDeps } from "./helpers.ts";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await syncRegistry(t.db, fixtureSource());
});
afterAll(async () => {
  await t.drop();
});

const NOW = new Date("2026-11-07T18:00:00Z");
const evidence = {
  uri: "docs/asset-dossiers/split.md",
  sha256: "b".repeat(64),
  provenance: "issuer_provided" as const,
  description: "Issuer notice",
  added_by: "registrar.testnet",
  timestamp_ms: NOW.getTime() - 3_600_000,
};
const action = (over: Partial<ChainCorporateAction> = {}): ChainCorporateAction => ({
  id: "syn-gold-oz-1",
  asset_id: "syn-gold-oz",
  kind: "split",
  announced_at_ms: NOW.getTime() - 86_400_000,
  ex_date_ms: NOW.getTime() + 600_000,
  effective_ms: NOW.getTime() + 600_000,
  freeze_from_ms: NOW.getTime() - 60_000,
  freeze_until_ms: NOW.getTime() + 3_600_000,
  multiplier_change: { num: "2", den: "1" },
  evidence: [evidence],
  status: "approved",
  proposed_by: "registrar.testnet",
  approved_by: "approver.testnet",
  applied_representations: ["tgold-a"],
  history: [{ status: "proposed", by: "registrar.testnet", at_ms: 1, note: "" }],
  ...over,
});
const lifecycle = (over: Partial<ChainLifecycle> = {}): ChainLifecycle => ({
  kind: "fungible",
  no_conversion: false,
  bridge_only: false,
  stage: "active",
  history: [],
  delist_request: null,
  ...over,
});
const strike = (over: Partial<ChainNavStrike> = {}): ChainNavStrike => ({
  as_of_ms: NOW.getTime() - 3_600_000,
  nav_per_unit: "1025000000",
  cutoff_ms: NOW.getTime() + 3_600_000,
  currency: "USD",
  source: "simulated_feed",
  simulated: true,
  submitted_ms: NOW.getTime() - 3_599_000,
  publisher_key: "ed25519:FgcwodK7aTtn3DgvqwPuSseKgTPcMpGmK6zdf7Ri9KXm",
  ...over,
});

describe("asset lifecycle, corporate action and NAV endpoints", () => {
  let app: FastifyInstance;
  let navReads: string[] = [];
  let life: ChainLifecycle | null;
  let actions: ChainCorporateAction[];
  let nav: ChainNavStrike | null;
  const actionsChain: ActionsChain = {
    getCorporateActions: async () => actions,
    getMultiplierEpochs: async (id) => [
      { effective_ms: 0, multiplier: { num: "1", den: "1000000" }, action_id: "genesis" },
      ...(id === "tgold-a"
        ? [
            {
              effective_ms: NOW.getTime() + 600_000,
              multiplier: { num: "1", den: "500000" },
              action_id: "syn-gold-oz-1",
            },
          ]
        : []),
    ],
    getLifecycle: async () => life,
    getNavStrike: async (id) => {
      navReads.push(id);
      return nav;
    },
  };
  beforeAll(() => {
    app = buildApp({ ...testAppDeps(t.db), actionsChain, now: () => NOW });
  });
  afterAll(async () => {
    await app.close();
  });
  const get = (url: string) => app.inject({ method: "GET", url });

  it("serves the lifecycle with its history and an open delist request", async () => {
    life = lifecycle({
      stage: "matured",
      kind: "term_instrument",
      history: [
        {
          from: "active",
          to: "matured",
          by: "registrar.testnet",
          at_ms: NOW.getTime() - 1_000,
          evidence_hash: null,
          note: "reached maturity",
        },
      ],
      delist_request: {
        by: "registrar.testnet",
        evidence_hash: "c".repeat(64),
        note: "wind down",
        at_ms: NOW.getTime(),
      },
    });
    const res = await get("/v1/assets/tgold-a/lifecycle");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      assetId: "tgold-a",
      kind: "term_instrument",
      stage: "matured",
      noConversion: false,
      history: [{ from: "active", to: "matured", at: "2026-11-07T17:59:59.000Z" }],
      delistRequest: { by: "registrar.testnet", note: "wind down", at: "2026-11-07T18:00:00.000Z" },
    });
  });

  it("serves the actions of the claim with each wrapper's status and the multiplier schedules", async () => {
    actions = [action()];
    const res = await get("/v1/assets/tgold-b/corporate-actions");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ assetId: "tgold-b", canonicalAssetId: "syn-gold-oz" });
    expect(body.items[0]).toMatchObject({
      id: "syn-gold-oz-1",
      status: "approved",
      freezeActive: true,
      multiplierChange: { num: "2", den: "1" },
      effectiveAt: "2026-11-07T18:10:00.000Z",
      wrappers: [
        { representationId: "tgold-a", live: true, applied: true },
        { representationId: "tgold-b", live: true, applied: false },
      ],
      evidence: [{ provenance: "issuer_provided", addedBy: "registrar.testnet" }],
    });
    expect(body.multiplierEpochs).toEqual([
      {
        representationId: "tgold-a",
        epochs: [
          { effectiveAt: null, multiplier: { num: "1", den: "1000000" }, actionId: null },
          {
            effectiveAt: "2026-11-07T18:10:00.000Z",
            multiplier: { num: "1", den: "500000" },
            actionId: "syn-gold-oz-1",
          },
        ],
      },
      {
        representationId: "tgold-b",
        epochs: [{ effectiveAt: null, multiplier: { num: "1", den: "1000000" }, actionId: null }],
      },
    ]);
  });

  it("freezes only an approved action inside its window", async () => {
    const frozen = async (a: ChainCorporateAction) => {
      actions = [a];
      return (await get("/v1/assets/tgold-a/corporate-actions")).json().items[0].freezeActive;
    };
    expect(await frozen(action({ status: "proposed" }))).toBe(false);
    expect(await frozen(action({ freeze_from_ms: NOW.getTime() + 1 }))).toBe(false);
    expect(await frozen(action({ freeze_until_ms: NOW.getTime() }))).toBe(false);
    expect(await frozen(action({ status: "applied" }))).toBe(false);
  });

  it("answers an empty list for a claim with no actions", async () => {
    actions = [];
    const res = await get("/v1/assets/tgold-a/corporate-actions");
    expect(res.json().items).toEqual([]);
  });

  it("serves a fund's strike with its labels and the state of its window", async () => {
    life = lifecycle({ kind: "nav_fund" });
    nav = strike();
    const open = (await get("/v1/assets/tgold-a/nav")).json();
    expect(open).toMatchObject({ assetId: "tgold-a", kind: "nav_fund" });
    expect(open.strike).toMatchObject({
      navPerUnit: "10.25",
      source: "simulated_feed",
      simulated: true,
      windowState: "open",
      asOf: "2026-11-07T17:00:00.000Z",
      cutoff: "2026-11-07T19:00:00.000Z",
    });
    const windowOf = async (over: Partial<ChainNavStrike>) => {
      nav = strike(over);
      return (await get("/v1/assets/tgold-a/nav")).json().strike.windowState;
    };
    expect(await windowOf({ cutoff_ms: NOW.getTime() })).toBe("closed");
    expect(await windowOf({ as_of_ms: NOW.getTime() + 1_000 })).toBe("upcoming");
  });

  it("answers a null strike for a fund with none, and for an asset that is not a fund", async () => {
    life = lifecycle({ kind: "nav_fund" });
    nav = null;
    expect((await get("/v1/assets/tgold-a/nav")).json().strike).toBeNull();
    life = lifecycle();
    nav = strike();
    navReads = [];
    const plain = (await get("/v1/assets/tgold-a/nav")).json();
    expect(plain).toEqual({ assetId: "tgold-a", kind: "fungible", strike: null });
    expect(navReads).toEqual([]);
  });

  it("answers 404 for an unknown asset on every endpoint, and when the chain does not know it", async () => {
    for (const path of ["lifecycle", "corporate-actions", "nav"]) {
      expect((await get(`/v1/assets/ghost/${path}`)).statusCode).toBe(404);
    }
    life = null;
    expect((await get("/v1/assets/tgold-a/lifecycle")).statusCode).toBe(404);
    expect((await get("/v1/assets/tgold-a/nav")).statusCode).toBe(404);
  });
});
