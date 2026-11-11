import { describe, expect, it } from "vitest";
import { parseEvents } from "../src/events.ts";
import { parseMirrorEvent } from "../src/mirror/events.ts";
import * as fx from "./mirror-fixtures.ts";

function parse(event: [string, Record<string, unknown>]) {
  const line = `EVENT_JSON:${JSON.stringify({ standard: "pontis", version: "1.0.0", event: event[0], data: event[1] })}`;
  const [core] = parseEvents([line]);
  if (!core) throw new Error("fixture did not parse as an event");
  return parseMirrorEvent(core);
}

describe("mirror event payloads", () => {
  it("reads every event ADR 0020 and ADR 0019 add", () => {
    const events = [
      fx.signerKeyAdded(),
      fx.signerKeyRemoved(),
      fx.custodianRegistered(),
      fx.custodianStatusChanged(),
      fx.custodianKeySet(),
      fx.custodyLinked(),
      fx.reserveAttested(),
      fx.reservePolicySet(),
      fx.reserveSupplyRead(),
      fx.reserveStatusChanged(),
      fx.mintRequested(),
      fx.redemptionTermsSet(),
      fx.redemptionRequested(),
      fx.redemptionRefused(),
      fx.redemptionAccepted(),
      fx.redemptionRejected(),
      fx.redemptionFulfilled(),
      fx.redemptionExpired(),
      fx.redemptionReclaimed(),
      [
        "mint_completed",
        {
          id: 1,
          representation_id: "a",
          recipient: "alice.testnet",
          amount: "5",
          circulating_units: "5",
          headroom_units: "0",
          timestamp_ms: 1,
        },
      ],
      ["mint_failed", { id: 1, representation_id: "a", reason: "token refused", timestamp_ms: 1 }],
      ["mint_cancelled", { id: 1, by: "issuer-bo.testnet", timestamp_ms: 1 }],
      ["redemption_fulfil_failed", { id: 1, timestamp_ms: 1 }],
      ["redemption_reclaim_failed", { id: 1, timestamp_ms: 1 }],
    ] as [string, Record<string, unknown>][];
    for (const event of events) expect(parse(event), event[0]).toMatchObject({ kind: "event" });
  });

  it("ignores events that are not custody, reserve, mint, redemption or signer-key events", () => {
    expect(parse(["conversion_completed", { nonce: "n" }])).toEqual({ kind: "other" });
    expect(parse(["redemption_terms_requested", { id: 1 }])).toEqual({ kind: "other" });
  });

  it("reports a known event whose payload does not match instead of guessing", () => {
    const bad = parse(fx.reserveAttested({ reserved_units: 1_000, report_hash: "short" }));
    expect(bad).toMatchObject({ kind: "invalid", name: "reserve_attested" });
    expect(bad.kind === "invalid" && bad.problem).toContain("reserved_units");
    expect(parse(fx.redemptionExpired({ miss: "never" })).kind).toBe("invalid");
    // A refusal reason the contract does not have is a contract and indexer out of step.
    expect(parse(fx.redemptionRefused({ reason: "TOO_SMALL" })).kind).toBe("invalid");
    expect(parse(fx.redemptionRefused({ reason: "WINDOW_CLOSED" })).kind).toBe("event");
    expect(parse(fx.signerKeyAdded({ role: "registrar" })).kind).toBe("invalid");
  });

  it("keeps U128 amounts as exact strings beyond the safe integer range", () => {
    const big = "340282366920938463463374607431768211455";
    const parsed = parse(fx.reserveAttested({ reserved_units: big }));
    expect(parsed.kind === "event" && parsed.event.name === "reserve_attested").toBe(true);
    expect(
      parsed.kind === "event" &&
        "reserved_units" in parsed.event.data &&
        parsed.event.data.reserved_units,
    ).toBe(big);
  });
});
