import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = {
  DATABASE_URL: "postgres://x",
  PONTIS_CORE_ACCOUNT_ID: "core.testnet",
  QUOTE_SIGNER_SECRET_KEY: "ed25519:abc",
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(base)).toMatchObject({
      PORT: 3000,
      NEAR_NETWORK_ID: "testnet",
      REGISTRY_SYNC_INTERVAL_MS: 15_000,
      QUOTE_SWEEP_INTERVAL_MS: 10_000,
      NEAR_RPC_URL: "https://rpc.testnet.near.org",
    });
  });

  it("coerces numeric variables", () => {
    expect(loadConfig({ ...base, PORT: "8080", REGISTRY_SYNC_INTERVAL_MS: "0" })).toMatchObject({
      PORT: 8080,
      REGISTRY_SYNC_INTERVAL_MS: 0,
    });
  });

  it("requires the quote-signer key and refuses a sweep interval under one second", () => {
    expect(() => loadConfig({ DATABASE_URL: "x", PONTIS_CORE_ACCOUNT_ID: "core.testnet" })).toThrow(
      /QUOTE_SIGNER_SECRET_KEY/,
    );
    expect(() => loadConfig({ ...base, QUOTE_SWEEP_INTERVAL_MS: "10" })).toThrow(
      /QUOTE_SWEEP_INTERVAL_MS/,
    );
  });

  it("lists every problem at once and refuses mainnet", () => {
    expect(() => loadConfig({ NEAR_NETWORK_ID: "mainnet", PORT: "0" })).toThrow(
      /DATABASE_URL.*PONTIS_CORE_ACCOUNT_ID|NEAR_NETWORK_ID/s,
    );
    expect(() => loadConfig({ ...base, NEAR_NETWORK_ID: "mainnet" })).toThrow(/NEAR_NETWORK_ID/);
  });
});
