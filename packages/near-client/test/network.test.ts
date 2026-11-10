import { describe, expect, it } from "vitest";
import {
  assertNetwork,
  NetworkCheckError,
  NetworkMismatchError,
  networkProblem,
  redactRpcUrl,
  RpcClient,
} from "../src/index.ts";

function clientFor(fetchImpl: typeof fetch, url = "https://rpc.example.com"): RpcClient {
  return new RpcClient({ url, fetch: fetchImpl });
}

const answer = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

const status = (chainId: string | undefined) => answer({ result: { chain_id: chainId } });

describe("networkProblem", () => {
  it("accepts the chain each network id stands for", () => {
    expect(networkProblem("testnet", "testnet")).toBeUndefined();
    expect(networkProblem("sandbox", "test-chain-kcpTn")).toBeUndefined();
  });

  it("refuses another chain and names both", () => {
    const problem = networkProblem("testnet", "mainnet");
    expect(problem).toMatch(/NEAR_NETWORK_ID is testnet/);
    expect(problem).toMatch(/"mainnet"/);
    expect(networkProblem("sandbox", "testnet")).toBeDefined();
    expect(networkProblem("testnet", "test-chain-kcpTn")).toBeDefined();
  });
});

describe("redactRpcUrl", () => {
  it("drops userinfo, path and query", () => {
    expect(redactRpcUrl("https://user:secret@rpc.example.com:8443/key-123/?apiKey=abc")).toBe(
      "https://rpc.example.com:8443",
    );
    expect(redactRpcUrl("not a url")).toBe("<invalid URL>");
  });
});

describe("assertNetwork", () => {
  it("passes for testnet and for a sandbox chain id", async () => {
    await expect(assertNetwork(clientFor(status("testnet")), "testnet")).resolves.toEqual({
      networkId: "testnet",
      chainId: "testnet",
      rpcUrl: "https://rpc.example.com",
    });
    await expect(
      assertNetwork(clientFor(status("test-chain-kcpTn")), "sandbox"),
    ).resolves.toMatchObject({ chainId: "test-chain-kcpTn" });
  });

  it("refuses a node that serves another chain", async () => {
    const error = await assertNetwork(clientFor(status("mainnet")), "testnet").catch((e) => e);
    expect(error).toBeInstanceOf(NetworkMismatchError);
    expect(error.message).toMatch(/NEAR_NETWORK_ID is testnet.*"mainnet".*startup refused/s);
  });

  it("fails clearly when the request is rejected, non-200 or not JSON", async () => {
    const rejected = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const notJson = (async () => new Response("<html>", { status: 502 })) as typeof fetch;
    for (const fetchImpl of [rejected, answer({}, 429), notJson]) {
      const error = await assertNetwork(clientFor(fetchImpl), "testnet").catch((e) => e);
      expect(error).toBeInstanceOf(NetworkCheckError);
      expect(error.message).toMatch(/rpc\.example\.com.*Startup refused/s);
    }
  });

  it("fails when the status has no chain id", async () => {
    for (const fetchImpl of [status(undefined), answer({ result: {} }), answer({})]) {
      const error = await assertNetwork(clientFor(fetchImpl), "testnet").catch((e) => e);
      expect(error).toBeInstanceOf(NetworkCheckError);
      expect(error.message).toMatch(/without a chain id/);
    }
  });

  it("never puts the URL's secrets in an error message", async () => {
    const url = "https://user:hunter2@rpc.example.com/path-key/?apiKey=hunter3";
    const rejected = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    for (const fetchImpl of [rejected, status("mainnet"), status(undefined)]) {
      const error = await assertNetwork(clientFor(fetchImpl, url), "testnet").catch((e) => e);
      expect(error.message).not.toMatch(/hunter|path-key|apiKey/);
      expect(error.message).toMatch(/https:\/\/rpc\.example\.com/);
    }
  });
});
