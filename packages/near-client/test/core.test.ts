import { describe, expect, it } from "vitest";
import { CoreClient, TokenClient } from "../src/core.ts";
import type { RpcClient } from "../src/rpc.ts";

type Call = { contractId: string; method: string; args: Record<string, unknown> };

function fakeRpc(handler: (call: Call) => unknown) {
  const calls: Call[] = [];
  const rpc = {
    view: async (contractId: string, method: string, args: Record<string, unknown> = {}) => {
      const call = { contractId, method, args };
      calls.push(call);
      return handler(call);
    },
    status: async () => ({ chainId: "testnet", latestBlockHeight: 42 }),
  } as unknown as RpcClient;
  return { rpc, calls };
}

const issuer = (id: string) => ({
  id,
  name: id,
  jurisdiction: null,
  authorized_categories: [],
  controlled_accounts: [],
  contact: null,
  evidence: [],
  registered_by: "owner.testnet",
  registered_at_ms: 1,
  last_reviewed_ms: null,
  synthetic: true,
  verification_status: "unverified",
  status: "active",
});

describe("CoreClient", () => {
  it("pages through a list view until a short page", async () => {
    const all = Array.from({ length: 101 }, (_, i) => issuer(`issuer-${i}`));
    const { rpc, calls } = fakeRpc(({ args }) =>
      all.slice(args.from_index as number, (args.from_index as number) + 100),
    );
    const issuers = await new CoreClient(rpc, "core.testnet").listIssuers();
    expect(issuers).toHaveLength(101);
    expect(calls.map((c) => c.args.from_index)).toEqual([0, 100]);
    expect(calls.every((c) => c.contractId === "core.testnet" && c.method === "list_issuers")).toBe(
      true,
    );
  });

  it("does not request a second page after an empty first page", async () => {
    const { rpc, calls } = fakeRpc(() => []);
    expect(await new CoreClient(rpc, "core.testnet").listRepresentations()).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("fails loudly when the contract returns a malformed record", async () => {
    const { rpc } = fakeRpc(() => [{ ...issuer("a"), status: "live" }]);
    await expect(new CoreClient(rpc, "core.testnet").listIssuers()).rejects.toThrow();
  });

  it("returns null for an unknown policy and validates inventory as a decimal string", async () => {
    const { rpc } = fakeRpc(({ method }) => (method === "get_policy" ? null : "1000"));
    const core = new CoreClient(rpc, "core.testnet");
    expect(await core.getPolicy("ghost")).toBeNull();
    expect(await core.getInventory("tgold-a")).toBe("1000");
    const bad = new CoreClient(fakeRpc(() => 1000).rpc, "core.testnet");
    await expect(bad.getInventory("tgold-a")).rejects.toThrow();
  });

  it("reads the input held for in-flight conversions and rejects a non-string amount", async () => {
    const { rpc, calls } = fakeRpc(() => "250");
    expect(await new CoreClient(rpc, "core.testnet").getPendingInbound("tgold-a")).toBe("250");
    expect(calls[0]).toMatchObject({ method: "get_pending_inbound" });
    const bad = new CoreClient(fakeRpc(() => 250).rpc, "core.testnet");
    await expect(bad.getPendingInbound("tgold-a")).rejects.toThrow();
  });

  it("reads the chain height", async () => {
    expect(await new CoreClient(fakeRpc(() => null).rpc, "core.testnet").blockHeight()).toBe(42);
  });
});

describe("CoreClient quote-time views", () => {
  const terms = { ratio: { num: "1000", den: "1" }, compatibility_version: 2, policy_version: 1 };

  it("returns route terms for an executable pair and a snake_case refusal otherwise", async () => {
    const ok = new CoreClient(
      fakeRpc(() => ({ executable: true, refusal: null, terms, next_freeze_ms: null })).rpc,
      "core.testnet",
    );
    expect((await ok.getRoute("tgold-a", "tgold-b")).terms?.compatibility_version).toBe(2);
    const refused = {
      executable: false,
      refusal: "relationship_suspended",
      terms: null,
      next_freeze_ms: null,
    };
    const no = new CoreClient(fakeRpc(() => refused).rpc, "core.testnet");
    expect((await no.getRoute("tgold-a", "tgold-b")).refusal).toBe("relationship_suspended");
    const unknown = new CoreClient(
      fakeRpc(() => ({ ...refused, refusal: "made_up" })).rpc,
      "core.testnet",
    );
    await expect(unknown.getRoute("a", "b")).rejects.toThrow();
  });

  it.each([
    "corporate_action_freeze",
    "corporate_action_pending",
    "epoch_mismatch",
    "not_convertible",
    "lifecycle_blocked",
    "nav_window_closed",
    "reserve_restricted",
    "reserve_stale",
  ])("accepts the %s refusal and the next freeze time", async (refusal) => {
    const view = { executable: false, refusal, terms: null, next_freeze_ms: 1_794_100_000_000 };
    const core = new CoreClient(fakeRpc(() => view).rpc, "core.testnet");
    expect(await core.getRoute("a", "b")).toEqual(view);
  });

  it("refuses a route view without next_freeze_ms: the contract always sends it", async () => {
    const view = { executable: false, refusal: "epoch_mismatch", terms: null };
    const core = new CoreClient(fakeRpc(() => view).rpc, "core.testnet");
    await expect(core.getRoute("a", "b")).rejects.toThrow();
  });

  it("reads the guard breakdown with the amount, and refuses a shape the contract never sends", async () => {
    const view = {
      executable: true,
      checks: [{ name: "route", passed: true, detail: "executable" }],
      fee_bps: 14,
      skew_bps: 4,
      degraded: false,
    };
    const { rpc, calls } = fakeRpc(() => view);
    const core = new CoreClient(rpc, "core.testnet");
    expect(await core.getRouteGuards("tgold-a", "tgold-b", "5000000")).toEqual(view);
    expect(calls[0]).toEqual({
      contractId: "core.testnet",
      method: "get_route_guards",
      args: { from_id: "tgold-a", to_id: "tgold-b", amount_in: "5000000" },
    });
    await core.getRouteGuards("tgold-a", "tgold-b");
    expect(calls[1]?.args.amount_in).toBeNull();
    const bad = new CoreClient(fakeRpc(() => ({ ...view, fee_bps: -1 })).rpc, "core.testnet");
    await expect(bad.getRouteGuards("a", "b")).rejects.toThrow();
  });

  it("reads the stored price with its honesty label, null before any, and refuses a malformed one", async () => {
    const stored = {
      price: "10000000000",
      currency: "USD",
      as_of_ms: 1_790_000_000_000,
      submitted_ms: 1_790_000_001_000,
      simulated: true,
      source: "simulated_feed",
      publisher_key: "ed25519:FgcwodK7aTtn3DgvqwPuSseKgTPcMpGmK6zdf7Ri9KXm",
    };
    const price = (value: unknown) => new CoreClient(fakeRpc(() => value).rpc, "core.testnet");
    expect(await price(stored).getPrice("tgold-a")).toEqual(stored);
    expect(await price(null).getPrice("tgold-a")).toBeNull();
    await expect(price({ ...stored, price: "1.5" }).getPrice("tgold-a")).rejects.toThrow();
    await expect(price({ ...stored, simulated: undefined }).getPrice("tgold-a")).rejects.toThrow();
  });

  it("passes the account to is_allowed and validates fee and signer", async () => {
    const { rpc, calls } = fakeRpc(({ method }) =>
      method === "is_allowed" ? true : method === "get_fee_bps" ? 10 : null,
    );
    const core = new CoreClient(rpc, "core.testnet");
    expect(await core.isAllowed("tgold-a", "alice.testnet")).toBe(true);
    expect(calls[0]?.args).toEqual({ representation_id: "tgold-a", account_id: "alice.testnet" });
    expect(await core.getFeeBps()).toBe(10);
    expect(await core.getQuoteSigner()).toBeNull();
    await expect(
      new CoreClient(fakeRpc(() => 101).rpc, "core.testnet").getFeeBps(),
    ).rejects.toThrow();
  });
});

describe("TokenClient", () => {
  it("reads balances and treats an unregistered account as null", async () => {
    const { rpc } = fakeRpc(({ method }) => (method === "ft_balance_of" ? "5" : null));
    const token = new TokenClient(rpc, "tgold-a.testnet");
    expect(await token.ftBalanceOf("alice.testnet")).toBe("5");
    expect(await token.storageBalanceOf("alice.testnet")).toBeNull();
  });
});
