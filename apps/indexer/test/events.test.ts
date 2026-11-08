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
  const base = { DATABASE_URL: "postgres://x", PONTIS_CORE_ACCOUNT_ID: "core.testnet" };

  it("defaults to public testnet RPC and indexing from the chain head", () => {
    const config = loadConfig(base);
    expect(config.NEAR_RPC_URL).toBe("https://rpc.testnet.near.org");
    expect(config.INDEXER_START_HEIGHT).toBeUndefined();
  });

  it("lists every invalid variable at once", () => {
    expect(() => loadConfig({ INDEXER_POLL_MS: "5" })).toThrow(
      /DATABASE_URL.*PONTIS_CORE_ACCOUNT_ID.*INDEXER_POLL_MS/,
    );
  });
});
