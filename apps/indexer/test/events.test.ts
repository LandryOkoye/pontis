import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { parseEvents } from "../src/events.ts";

const line = (event: string, data: unknown, standard = "pontis") =>
  `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event, data })}`;

describe("parseEvents", () => {
  it("keeps each event's position among the receipt's logs", () => {
    const events = parseEvents([
      "plain log",
      line("fee_updated", { fee_bps: 10 }),
      line("conversion_completed", { nonce: "ab" }),
    ]);
    expect(events.map((e) => [e.logIndex, e.name])).toEqual([
      [1, "fee_updated"],
      [2, "conversion_completed"],
    ]);
    expect(events[1]?.data).toEqual({ nonce: "ab" });
  });

  it("skips malformed JSON, other standards and events without an object payload", () => {
    expect(
      parseEvents([
        "EVENT_JSON:{not json",
        line("transfer", {}, "nep141"),
        'EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"x","data":[1]}',
        'EVENT_JSON:{"standard":"pontis","version":"1.0.0","data":{}}',
      ]),
    ).toEqual([]);
  });
});

describe("loadConfig", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    PONTIS_CORE_ACCOUNT_ID: "core.testnet",
    NEAR_RPC_URL: "https://test.rpc.fastnear.com",
  };

  it("indexes from the chain head and defaults to testnet", () => {
    const config = loadConfig(base);
    expect(config.NEAR_NETWORK_ID).toBe("testnet");
    expect(config.INDEXER_START_HEIGHT).toBeUndefined();
  });

  it("requires NEAR_RPC_URL instead of defaulting to a public endpoint", () => {
    const { NEAR_RPC_URL: _omitted, ...withoutRpc } = base;
    expect(() => loadConfig(withoutRpc)).toThrow(
      /NEAR_RPC_URL: required; see docs\/local-setup\.md \(RPC endpoints\)/,
    );
  });

  it("accepts sandbox, refuses mainnet as NEAR_NETWORK_ID", () => {
    expect(loadConfig({ ...base, NEAR_NETWORK_ID: "sandbox" }).NEAR_NETWORK_ID).toBe("sandbox");
    expect(() => loadConfig({ ...base, NEAR_NETWORK_ID: "mainnet" })).toThrow(/NEAR_NETWORK_ID/);
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

  it("lists every invalid variable at once", () => {
    expect(() => loadConfig({ INDEXER_POLL_MS: "5" })).toThrow(
      /DATABASE_URL.*PONTIS_CORE_ACCOUNT_ID.*INDEXER_POLL_MS/,
    );
  });
});
