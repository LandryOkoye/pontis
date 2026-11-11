import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";

const base = {
  DATABASE_URL: "postgres://x",
  PONTIS_CORE_ACCOUNT_ID: "core.testnet",
  QUOTE_SIGNER_SECRET_KEY: "ed25519:abc",
  NEAR_RPC_URL: "https://test.rpc.fastnear.com",
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    expect(loadConfig(base)).toMatchObject({
      PORT: 3000,
      NEAR_NETWORK_ID: "testnet",
      REGISTRY_SYNC_INTERVAL_MS: 15_000,
      QUOTE_SWEEP_INTERVAL_MS: 10_000,
      INDEXER_STALE_AFTER_MS: 30_000,
      INDEXER_MAX_LAG_BLOCKS: 50,
      NEAR_RPC_URL: "https://test.rpc.fastnear.com",
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

  it("reads the indexer health thresholds and refuses a stale limit under one second", () => {
    expect(
      loadConfig({ ...base, INDEXER_STALE_AFTER_MS: "5000", INDEXER_MAX_LAG_BLOCKS: "0" }),
    ).toMatchObject({ INDEXER_STALE_AFTER_MS: 5000, INDEXER_MAX_LAG_BLOCKS: 0 });
    expect(() => loadConfig({ ...base, INDEXER_STALE_AFTER_MS: "10" })).toThrow(
      /INDEXER_STALE_AFTER_MS/,
    );
  });

  it("lists every problem at once and refuses mainnet", () => {
    expect(() => loadConfig({ NEAR_NETWORK_ID: "mainnet", PORT: "0" })).toThrow(
      /DATABASE_URL.*PONTIS_CORE_ACCOUNT_ID|NEAR_NETWORK_ID/s,
    );
    expect(() => loadConfig({ ...base, NEAR_NETWORK_ID: "mainnet" })).toThrow(/NEAR_NETWORK_ID/);
  });

  it("reads CORS origins, admin key and rate limits, treating an empty admin key as unset", () => {
    const config = loadConfig({
      ...base,
      CORS_ORIGIN: "https://a.example, http://localhost:5173",
      ADMIN_API_KEY: "",
      RATE_LIMIT_ADMIN: "3",
      TRUST_PROXY: "true",
    });
    expect(config).toMatchObject({
      CORS_ORIGIN: ["https://a.example", "http://localhost:5173"],
      ADMIN_API_KEY: undefined,
      RATE_LIMIT_ADMIN: 3,
      RATE_LIMIT_READ: 120,
      RATE_LIMIT_WRITE: 30,
      TRUST_PROXY: true,
    });
  });

  it("refuses a wildcard or path in CORS_ORIGIN and an admin key under 16 characters", () => {
    expect(() => loadConfig({ ...base, CORS_ORIGIN: "*" })).toThrow(/CORS_ORIGIN/);
    expect(() => loadConfig({ ...base, CORS_ORIGIN: "https://a.example/app" })).toThrow(
      /CORS_ORIGIN/,
    );
    expect(() => loadConfig({ ...base, ADMIN_API_KEY: "short" })).toThrow(/ADMIN_API_KEY/);
  });

  it("requires NEAR_RPC_URL instead of defaulting to a public endpoint", () => {
    const { NEAR_RPC_URL: _omitted, ...withoutRpc } = base;
    expect(() => loadConfig(withoutRpc)).toThrow(
      /NEAR_RPC_URL: required; see docs\/local-setup\.md \(RPC endpoints\)/,
    );
  });

  it("parses the .env.example endpoint, which is the one docs/local-setup.md recommends", () => {
    const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
    const value = /^NEAR_RPC_URL=(.+)$/m.exec(example)?.[1];
    expect(loadConfig({ ...base, NEAR_RPC_URL: value }).NEAR_RPC_URL).toBe(
      "https://test.rpc.fastnear.com",
    );
    const docs = readFileSync(new URL("../../../docs/local-setup.md", import.meta.url), "utf8");
    expect(docs).toContain(`\`${value}\``);
  });

  it("takes the relayer account and key together, or neither", () => {
    expect(loadConfig(base).PONTIS_RELAYER_ACCOUNT_ID).toBeUndefined();
    const both = {
      PONTIS_RELAYER_ACCOUNT_ID: "relayer.testnet",
      PONTIS_RELAYER_SECRET_KEY: "ed25519:abc",
    };
    expect(loadConfig({ ...base, ...both })).toMatchObject(both);
    expect(() => loadConfig({ ...base, PONTIS_RELAYER_ACCOUNT_ID: "relayer.testnet" })).toThrow(
      /set together/,
    );
    expect(() => loadConfig({ ...base, PONTIS_RELAYER_SECRET_KEY: "ed25519:abc" })).toThrow(
      /set together/,
    );
    expect(() => loadConfig({ ...base, ...both, PONTIS_RELAYER_SECRET_KEY: "not-a-key" })).toThrow(
      /PONTIS_RELAYER_SECRET_KEY/,
    );
  });
});
