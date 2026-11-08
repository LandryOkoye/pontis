import { describe, expect, it } from "vitest";
import { ContractError, RpcClient, RpcError } from "../src/rpc.ts";

function fakeFetch(handler: (body: Record<string, unknown>) => unknown, ok = true): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return { ok, status: ok ? 200 : 502, json: async () => handler(body) };
  }) as unknown as typeof fetch;
}

const bytes = (value: unknown): number[] => [...Buffer.from(JSON.stringify(value))];

describe("RpcClient", () => {
  it("encodes args as base64 JSON and decodes the JSON result", async () => {
    let seen: Record<string, unknown> = {};
    const client = new RpcClient({
      url: "http://rpc",
      fetch: fakeFetch((body) => {
        seen = body;
        return { jsonrpc: "2.0", id: 1, result: { result: bytes({ items: [1, 2] }) } };
      }),
    });
    expect(await client.view("core.testnet", "list_issuers", { limit: 2 })).toEqual({
      items: [1, 2],
    });
    const params = seen.params as Record<string, string>;
    expect(params.method_name).toBe("list_issuers");
    expect(params.account_id).toBe("core.testnet");
    expect(JSON.parse(Buffer.from(params.args_base64 as string, "base64").toString())).toEqual({
      limit: 2,
    });
  });

  it("decodes a JSON null result", async () => {
    const client = new RpcClient({
      url: "http://rpc",
      fetch: fakeFetch(() => ({ result: { result: bytes(null) } })),
    });
    expect(await client.view("core.testnet", "get_issuer", { id: "x" })).toBeNull();
  });

  it("raises a ContractError when the contract panics", async () => {
    const client = new RpcClient({
      url: "http://rpc",
      fetch: fakeFetch(() => ({
        result: { error: "wasm execution failed: relationship not found" },
      })),
    });
    await expect(client.view("core.testnet", "get_route")).rejects.toBeInstanceOf(ContractError);
    await expect(client.view("core.testnet", "get_route")).rejects.toThrow(
      /relationship not found/,
    );
  });

  it("raises RpcError on JSON-RPC errors and non-200 responses", async () => {
    const failing = new RpcClient({
      url: "http://rpc",
      fetch: fakeFetch(() => ({ error: { code: -32000, message: "Server error" } })),
    });
    await expect(failing.status()).rejects.toMatchObject({ name: "RpcError", code: -32000 });
    const down = new RpcClient({ url: "http://rpc", fetch: fakeFetch(() => ({}), false) });
    await expect(down.status()).rejects.toThrow(RpcError);
  });

  it("keeps the node's cause name and HTTP status, even on a non-200 reply", async () => {
    const unknownBlock = new RpcClient({
      url: "http://rpc",
      fetch: fakeFetch(
        () => ({
          error: { code: -32000, message: "Server error", cause: { name: "UNKNOWN_BLOCK" } },
        }),
        false,
      ),
    });
    await expect(unknownBlock.call("block", { block_id: 1 })).rejects.toMatchObject({
      causeName: "UNKNOWN_BLOCK",
      httpStatus: 502,
      code: -32000,
    });
  });

  it("reads the chain height from status", async () => {
    const client = new RpcClient({
      url: "http://rpc",
      fetch: fakeFetch(() => ({
        result: {
          chain_id: "testnet",
          sync_info: { latest_block_height: 123, earliest_block_height: 7 },
        },
      })),
    });
    expect(await client.status()).toEqual({
      chainId: "testnet",
      latestBlockHeight: 123,
      earliestBlockHeight: 7,
    });
  });
});
