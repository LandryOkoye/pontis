import { describe, expect, it } from "vitest";
import { networkProblem } from "../lib/chain.ts";

describe("networkProblem", () => {
  it("accepts the chain each network id stands for", () => {
    expect(networkProblem("testnet", "testnet")).toBeUndefined();
    expect(networkProblem("sandbox", "test-chain-kcpTn")).toBeUndefined();
  });

  it("refuses mainnet behind a testnet or sandbox configuration, and names both", () => {
    const problem = networkProblem("testnet", "mainnet");
    expect(problem).toMatch(/NEAR_NETWORK_ID is testnet/);
    expect(problem).toMatch(/"mainnet"/);
    expect(problem).toMatch(/Refusing to send anything/);
    expect(networkProblem("sandbox", "mainnet")).toBeDefined();
  });

  it("does not take a testnet node for a sandbox, or the reverse", () => {
    expect(networkProblem("sandbox", "testnet")).toBeDefined();
    expect(networkProblem("testnet", "test-chain-kcpTn")).toBeDefined();
  });
});
