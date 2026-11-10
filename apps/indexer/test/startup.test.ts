import { NetworkCheckError, NetworkMismatchError, RpcClient } from "@pontis/near-client";
import { describe, expect, it, vi } from "vitest";
import { verifyStartup } from "../src/startup.ts";

const node = (chainId: string): RpcClient =>
  new RpcClient({
    url: "https://user:secret@rpc.example.com/key?apiKey=secret",
    fetch: (async () =>
      new Response(JSON.stringify({ result: { chain_id: chainId } }))) as typeof fetch,
  });

describe("verifyStartup", () => {
  it("logs the verified network, chain id and redacted URL", async () => {
    const info = vi.fn();
    await verifyStartup({ NEAR_NETWORK_ID: "testnet" }, node("testnet"), info);
    expect(info).toHaveBeenCalledWith("network verified", {
      networkId: "testnet",
      chainId: "testnet",
      rpc: "https://rpc.example.com",
    });
  });

  it("accepts a sandbox chain for sandbox", async () => {
    await expect(
      verifyStartup({ NEAR_NETWORK_ID: "sandbox" }, node("test-chain-abc"), vi.fn()),
    ).resolves.toBeUndefined();
  });

  it("refuses a node serving another chain and logs nothing", async () => {
    const info = vi.fn();
    await expect(
      verifyStartup({ NEAR_NETWORK_ID: "testnet" }, node("mainnet"), info),
    ).rejects.toThrow(NetworkMismatchError);
    expect(info).not.toHaveBeenCalled();
  });

  it("refuses when the node cannot be reached", async () => {
    const down = new RpcClient({
      url: "https://rpc.example.com",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    await expect(verifyStartup({ NEAR_NETWORK_ID: "testnet" }, down, vi.fn())).rejects.toThrow(
      NetworkCheckError,
    );
  });
});
