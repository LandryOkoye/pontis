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

  it("reads the chain height", async () => {
    expect(await new CoreClient(fakeRpc(() => null).rpc, "core.testnet").blockHeight()).toBe(42);
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
