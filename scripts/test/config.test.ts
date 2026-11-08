import { describe, expect, it } from "vitest";
import { loadConfig } from "../lib/config.ts";

const base = { DEPLOYER_ACCOUNT_ID: "pontis.testnet", DEPLOYER_PRIVATE_KEY: "ed25519:test" };

describe("config", () => {
  it("derives contract accounts from the deployer and defaults to testnet", () => {
    const c = loadConfig(base);
    expect(c.networkId).toBe("testnet");
    expect([c.coreId, c.tokenAId, c.tokenBId]).toEqual([
      "pontis-core.pontis.testnet",
      "tgold-a.pontis.testnet",
      "tgold-b.pontis.testnet",
    ]);
  });

  it("lets the environment override account ids and the RPC URL", () => {
    const c = loadConfig({
      ...base,
      PONTIS_CORE_ACCOUNT_ID: "core.example.testnet",
      NEAR_RPC_URL: "http://localhost:1",
    });
    expect(c.coreId).toBe("core.example.testnet");
    expect(c.rpcUrl).toBe("http://localhost:1");
  });

  it("refuses mainnet and any unknown network", () => {
    expect(() => loadConfig({ ...base, NEAR_NETWORK_ID: "mainnet" })).toThrow(
      /mainnet is out of scope/,
    );
  });

  it("requires a deployer account and a signing key", () => {
    expect(() => loadConfig({})).toThrow(/DEPLOYER_ACCOUNT_ID is required/);
    expect(() =>
      loadConfig({ DEPLOYER_ACCOUNT_ID: "x.testnet", NEAR_CREDENTIALS_DIR: "/nonexistent" }),
    ).toThrow(/No signing key/);
  });
});
