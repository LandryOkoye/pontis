// Logs captured from the deployed pontis-core on a local sandbox (a real conversion of 1 TGOLD-A
// for 999 TGOLD-B). If the contract renames an event field, these fail before the indexer does
// the wrong thing in production.

import { describe, expect, it } from "vitest";
import { parseEvents } from "../src/events.ts";
import { settlementFor } from "../src/settle.ts";

const COMPLETED =
  'EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"conversion_completed","data":{"fee":"1000000","user":"bob30161.test.near","nonce":"1f562b85a3d3ebdbe62058d7af6ab0be","ratio":{"den":"1","num":"1000"},"fee_bps":10,"token_in":"tgold-a.test.near","amount_in":"1000000","token_out":"tgold-b.test.near","amount_out":"999000000","timestamp_ms":1794126239308,"policy_version":1,"amount_out_gross":"1000000000","to_representation_id":"tgold-b","compatibility_version":2,"from_representation_id":"tgold-a"}}';

const ALLOWLIST =
  'EVENT_JSON:{"standard":"pontis","version":"1.0.0","event":"allowlist_updated","data":{"by":"test.near","allowed":true,"account_ids":["bob30161.test.near"],"timestamp_ms":1794126231329,"representation_id":"tgold-a"}}';

const quote = (over: Partial<{ amountOut: string; accountId: string }> = {}) => ({
  state: "SUBMITTED" as const,
  accountId: "bob30161.test.near",
  amountIn: "1000000",
  amountOut: "999000000",
  ...over,
});

describe("the contract's conversion_completed event", () => {
  const [event] = parseEvents(["Log line", COMPLETED]);

  it("parses with the nonce the quote carries", () => {
    expect([event?.logIndex, event?.name, event?.data.nonce]).toEqual([
      1,
      "conversion_completed",
      "1f562b85a3d3ebdbe62058d7af6ab0be",
    ]);
  });

  it("settles a quote that matches its amounts and user", () => {
    expect(event && settlementFor(quote(), event)).toEqual({ to: "SETTLED", reason: null });
  });

  it("flags a quote whose amounts or user differ", () => {
    expect(event && settlementFor(quote({ amountOut: "1" }), event)?.to).toBe(
      "REQUIRES_RECONCILIATION",
    );
    expect(event && settlementFor(quote({ accountId: "mallory.testnet" }), event)?.reason).toMatch(
      /^user on chain/,
    );
  });
});

describe("the contract's allowlist_updated event", () => {
  it("is stored but never moves a quote, whatever state it is in", () => {
    const [event] = parseEvents([ALLOWLIST]);
    expect(event?.name).toBe("allowlist_updated");
    expect(event && settlementFor(quote(), event)).toBeUndefined();
  });
});
