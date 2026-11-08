import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = { DATABASE_URL: "postgres://x", PONTIS_CORE_ACCOUNT_ID: "core.testnet" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(base)).toMatchObject({
      PORT: 3000,
      NEAR_NETWORK_ID: "testnet",
      REGISTRY_SYNC_INTERVAL_MS: 15_000,
      NEAR_RPC_URL: "https://rpc.testnet.near.org",
    });
  });

  it("coerces numeric variables", () => {
    expect(loadConfig({ ...base, PORT: "8080", REGISTRY_SYNC_INTERVAL_MS: "0" })).toMatchObject({
      PORT: 8080,
      REGISTRY_SYNC_INTERVAL_MS: 0,
    });
  });

  it("lists every problem at once and refuses mainnet", () => {
    expect(() => loadConfig({ NEAR_NETWORK_ID: "mainnet", PORT: "0" })).toThrow(
      /DATABASE_URL.*PONTIS_CORE_ACCOUNT_ID|NEAR_NETWORK_ID/s,
    );
    expect(() => loadConfig({ ...base, NEAR_NETWORK_ID: "mainnet" })).toThrow(/NEAR_NETWORK_ID/);
  });
});
