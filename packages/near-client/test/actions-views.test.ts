// Corporate action, epoch, lifecycle and NAV strike views (ADR 0017, ADR 0018) via a fake RPC.
import { describe, expect, it } from "vitest";
import { CoreClient } from "../src/core.ts";
import type { RpcClient } from "../src/rpc.ts";

function core(reply: unknown) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const rpc = {
    view: async (_id: string, method: string, args: Record<string, unknown> = {}) => {
      calls.push({ method, args });
      return reply;
    },
  } as unknown as RpcClient;
  return { client: new CoreClient(rpc, "core.testnet"), calls };
}

const evidence = {
  uri: "docs/asset-dossiers/split.md",
  sha256: "b".repeat(64),
  provenance: "issuer_provided",
  description: "Issuer notice",
  added_by: "registrar.testnet",
  timestamp_ms: 1_794_000_000_000,
};
const action = {
  id: "syn-gold-oz-1",
  asset_id: "syn-gold-oz",
  kind: "split",
  announced_at_ms: 1_794_000_000_000,
  ex_date_ms: 1_794_100_000_000,
  effective_ms: 1_794_100_000_000,
  freeze_from_ms: 1_794_090_000_000,
  freeze_until_ms: 1_794_110_000_000,
  multiplier_change: { num: "2", den: "1" },
  evidence: [evidence],
  status: "approved",
  proposed_by: "registrar.testnet",
  approved_by: "approver.testnet",
  applied_representations: ["tgold-a"],
  history: [
    { status: "proposed", by: "registrar.testnet", at_ms: 1_794_000_000_000, note: "" },
    { status: "approved", by: "approver.testnet", at_ms: 1_794_001_000_000, note: "checked" },
  ],
};

describe("corporate action views", () => {
  it("reads the actions of a canonical asset", async () => {
    const { client, calls } = core([action]);
    expect(await client.getCorporateActions("syn-gold-oz")).toEqual([action]);
    expect(calls[0]).toEqual({
      method: "get_corporate_actions",
      args: { asset_id: "syn-gold-oz" },
    });
  });

  it("accepts an action without a multiplier change and refuses an unknown kind or status", async () => {
    const plain = { ...action, kind: "dividend_cash", multiplier_change: null };
    expect((await core([plain]).client.getCorporateActions("a"))[0]?.multiplier_change).toBeNull();
    await expect(
      core([{ ...action, kind: "bonus" }]).client.getCorporateActions("a"),
    ).rejects.toThrow();
    await expect(
      core([{ ...action, status: "frozen" }]).client.getCorporateActions("a"),
    ).rejects.toThrow();
  });

  it("reads the multiplier schedule and refuses a fractional ratio part", async () => {
    const epochs = [
      { effective_ms: 0, multiplier: { num: "1", den: "1" }, action_id: "genesis" },
      {
        effective_ms: 1_794_100_000_000,
        multiplier: { num: "2", den: "1" },
        action_id: "syn-gold-oz-1",
      },
    ];
    const { client, calls } = core(epochs);
    expect(await client.getMultiplierEpochs("tgold-a")).toEqual(epochs);
    expect(calls[0]?.args).toEqual({ representation_id: "tgold-a" });
    const bad = [{ ...epochs[0], multiplier: { num: "1.5", den: "1" } }];
    await expect(core(bad).client.getMultiplierEpochs("tgold-a")).rejects.toThrow();
  });
});

describe("lifecycle and NAV strike views", () => {
  const lifecycle = {
    kind: "term_instrument",
    no_conversion: false,
    bridge_only: false,
    stage: "matured",
    history: [
      {
        from: "active",
        to: "matured",
        by: "registrar.testnet",
        at_ms: 1_794_000_000_000,
        evidence_hash: "c".repeat(64),
        note: "reached maturity",
      },
    ],
    delist_request: { by: "r.testnet", evidence_hash: null, note: "x", at_ms: 5 },
  };
  const strike = {
    as_of_ms: 1_794_000_000_000,
    nav_per_unit: "10000000000",
    cutoff_ms: 1_794_086_400_000,
    currency: "USD",
    source: "simulated_nav",
    simulated: true,
    submitted_ms: 1_794_000_001_000,
    publisher_key: "ed25519:FgcwodK7aTtn3DgvqwPuSseKgTPcMpGmK6zdf7Ri9KXm",
  };

  it("reads the lifecycle record, null for an unknown representation", async () => {
    expect(await core(lifecycle).client.getLifecycle("tgold-a")).toEqual(lifecycle);
    expect(await core(null).client.getLifecycle("nope")).toBeNull();
    await expect(
      core({ ...lifecycle, stage: "retired" }).client.getLifecycle("tgold-a"),
    ).rejects.toThrow();
  });

  it("reads a NAV strike with its honesty labels, null before any, and refuses a missing label", async () => {
    const { client, calls } = core(strike);
    expect(await client.getNavStrike("tnav-a")).toEqual(strike);
    expect(calls[0]).toEqual({ method: "get_nav_strike", args: { representation_id: "tnav-a" } });
    expect(await core(null).client.getNavStrike("tnav-a")).toBeNull();
    const { simulated: _omitted, ...unlabelled } = strike;
    await expect(core(unlabelled).client.getNavStrike("tnav-a")).rejects.toThrow();
  });
});
