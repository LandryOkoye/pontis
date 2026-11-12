// The ADR 0020 views over RPC, and the monitor's environment.

import { RpcClient } from "@pontis/near-client";
import { describe, expect, it } from "vitest";
import { CustodyViews } from "../src/chain-views.ts";
import { loadConfig } from "../src/config.ts";
import { nearVaultChain } from "../src/reconcile/near-vault-chain.ts";
import { reserveStatusFixture } from "./reconcile-helpers.ts";

function node(answers: Record<string, unknown>) {
  const calls: { method: string; args: unknown }[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const { params } = JSON.parse(String(init?.body)) as { params: Record<string, string> };
    const method = params.method_name as string;
    calls.push({
      method,
      args: JSON.parse(Buffer.from(params.args_base64 as string, "base64").toString()),
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: { result: [...Buffer.from(JSON.stringify(answers[method]))] } }),
    };
  }) as unknown as typeof fetch;
  return { rpc: new RpcClient({ url: "http://node", fetch: fetchImpl }), calls };
}

const ledger = { escrowed_in: "9", burned: "2", returned: "1", held: "6", open_amount: "6" };

describe("CustodyViews", () => {
  it("reads each view with the argument names the contract defines", async () => {
    const { rpc, calls } = node({
      get_reserve_status: reserveStatusFixture(),
      get_escrow_ledger: ledger,
      get_custodian: null,
    });
    const views = new CustodyViews(rpc, "core.testnet");
    expect((await views.reserveStatus("tgold-a")).state).toBe("ok");
    expect(await views.escrowHeld("tgold-a")).toBe("6");
    expect(await views.custodian("nobody")).toBeNull();
    expect(calls).toEqual([
      { method: "get_reserve_status", args: { representation_id: "tgold-a" } },
      { method: "get_escrow_ledger", args: { representation_id: "tgold-a" } },
      { method: "get_custodian", args: { id: "nobody" } },
    ]);
  });

  it("refuses a status that does not match the contract's shape", async () => {
    const { rpc } = node({ get_reserve_status: { state: "great" } });
    await expect(new CustodyViews(rpc, "core.testnet").reserveStatus("a")).rejects.toThrow();
  });

  it("is what the reconciler's chain reads escrow and reserve status through", async () => {
    const { rpc } = node({ get_escrow_ledger: ledger, get_reserve_status: reserveStatusFixture() });
    const chain = nearVaultChain(rpc, "core.testnet");
    expect(await chain.escrowHeld("a")).toBe("6");
    expect((await chain.reserveStatus("a")).simulated).toBe(true);
  });
});

describe("reserve monitor configuration", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    PONTIS_CORE_ACCOUNT_ID: "core.testnet",
    NEAR_RPC_URL: "https://test.rpc.fastnear.com",
  };

  it("runs every minute and only reads when no signer is configured", () => {
    const config = loadConfig(base);
    expect(config.RESERVE_MONITOR_INTERVAL_MS).toBe(60_000);
    expect(config.RESERVE_MONITOR_ACCOUNT_ID).toBeUndefined();
  });

  it("treats empty values from a .env file as unset", () => {
    const config = loadConfig({
      ...base,
      RESERVE_MONITOR_ACCOUNT_ID: "",
      RESERVE_MONITOR_PRIVATE_KEY: "",
    });
    expect(config.RESERVE_MONITOR_ACCOUNT_ID).toBeUndefined();
    expect(config.RESERVE_MONITOR_PRIVATE_KEY).toBeUndefined();
  });

  it("needs the account and its key together, and a key that looks like one", () => {
    const key = `ed25519:${"1".repeat(60)}`;
    expect(
      loadConfig({
        ...base,
        RESERVE_MONITOR_ACCOUNT_ID: "mon.testnet",
        RESERVE_MONITOR_PRIVATE_KEY: key,
      }).RESERVE_MONITOR_ACCOUNT_ID,
    ).toBe("mon.testnet");
    expect(() => loadConfig({ ...base, RESERVE_MONITOR_ACCOUNT_ID: "mon.testnet" })).toThrow(
      /set together/,
    );
    expect(() => loadConfig({ ...base, RESERVE_MONITOR_PRIVATE_KEY: key })).toThrow(/set together/);
    expect(() =>
      loadConfig({
        ...base,
        RESERVE_MONITOR_ACCOUNT_ID: "mon.testnet",
        RESERVE_MONITOR_PRIVATE_KEY: "hunter2",
      }),
    ).toThrow(/ed25519/);
  });

  it("turns off with 0", () => {
    expect(
      loadConfig({ ...base, RESERVE_MONITOR_INTERVAL_MS: "0" }).RESERVE_MONITOR_INTERVAL_MS,
    ).toBe(0);
  });
});
