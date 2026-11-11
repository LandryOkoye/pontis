import { describe, expect, it } from "vitest";
import { parseRatio, parseTime } from "../lib/arg-parse.ts";
import { parseActionsArgs } from "../lib/action-ops.ts";

const HASH = "ab".repeat(32);
const PROPOSE = [
  "propose",
  "syn-stock",
  "split",
  "--announced",
  "2026-11-01T00:00:00Z",
  "--ex-date",
  "2026-11-20",
  "--effective",
  "1795000000000",
  "--freeze-from",
  "1794990000000",
  "--freeze-until",
  "1795010000000",
  "--multiplier",
  "2/1",
];

describe("actions arguments", () => {
  it("parses a split proposal with times in either form and the ratio as strings", () => {
    expect(parseActionsArgs(PROPOSE)).toEqual({
      kind: "propose",
      assetId: "syn-stock",
      actionKind: "split",
      announcedAtMs: Date.UTC(2026, 10, 1),
      exDateMs: Date.UTC(2026, 10, 20),
      effectiveMs: 1_795_000_000_000,
      freezeFromMs: 1_794_990_000_000,
      freezeUntilMs: 1_795_010_000_000,
      multiplierChange: { num: "2", den: "1" },
    });
  });

  it("parses the rest of the commands the runbook uses", () => {
    expect(
      parseActionsArgs([
        "add-evidence",
        "syn-stock-1",
        "--uri",
        "https://x",
        "--sha256",
        HASH,
        "--description",
        "notice",
      ]),
    ).toMatchObject({
      kind: "add-evidence",
      actionId: "syn-stock-1",
      provenance: "issuer_provided",
    });
    expect(parseActionsArgs(["approve", "syn-stock-1", "--rationale", "checked"])).toEqual({
      kind: "approve",
      actionId: "syn-stock-1",
      rationale: "checked",
    });
    expect(
      parseActionsArgs(["apply", "syn-stock-1", "tstock-a", "--multiplier", "1/500000"]),
    ).toEqual({
      kind: "apply",
      actionId: "syn-stock-1",
      representationId: "tstock-a",
      newMultiplier: { num: "1", den: "500000" },
    });
    expect(parseActionsArgs(["apply", "syn-stock-1", "tstock-a"])).toMatchObject({
      newMultiplier: null,
    });
    expect(parseActionsArgs(["settle", "syn-stock-1"])).toEqual({
      kind: "settle",
      actionId: "syn-stock-1",
    });
    expect(
      parseActionsArgs(["set-stage", "tnote-a", "matured", "--note", "term ended"]),
    ).toMatchObject({
      to: "matured",
      evidenceHash: null,
    });
    expect(parseActionsArgs(["set-flags", "tfund-a", "nav_fund", "--bridge-only"])).toEqual({
      kind: "set-flags",
      representationId: "tfund-a",
      assetKind: "nav_fund",
      noConversion: false,
      bridgeOnly: true,
    });
    expect(
      parseActionsArgs([
        "request-delist",
        "tfund-a",
        "--note",
        "wound up",
        "--evidence-hash",
        HASH,
      ]),
    ).toMatchObject({
      evidenceHash: HASH,
    });
    expect(parseActionsArgs(["approve-delist", "tfund-a"])).toEqual({
      kind: "approve-delist",
      representationId: "tfund-a",
    });
    expect(parseActionsArgs(["nav", "tfund-a"])).toEqual({
      kind: "nav",
      representationId: "tfund-a",
      nav: undefined,
      windowMs: 24 * 3_600_000,
    });
    expect(
      parseActionsArgs(["nav", "tfund-a", "--nav", "1.0234", "--window-hours", "6"]),
    ).toMatchObject({
      nav: 102_340_000n,
      windowMs: 6 * 3_600_000,
    });
  });

  it.each([
    [[], /usage/],
    [["explode"], /usage/],
    [PROPOSE.slice(0, -2).concat(["--multiplier", "2"]), /num\/den/],
    [PROPOSE.map((t) => (t === "split" ? "stock_split" : t)), /kind must be one of/],
    [PROPOSE.map((t) => (t === "1795000000000" ? "1794980000000" : t)), /must contain --effective/],
    [PROPOSE.concat(["--bogus", "1"]), /unknown option --bogus/],
    [PROPOSE.slice(0, 3), /--announced is required/],
    [["approve", "syn-stock-1"], /--rationale is required/],
    [["approve", "stock"], /action id/],
    [
      ["add-evidence", "syn-stock-1", "--uri", "u", "--sha256", "abc", "--description", "d"],
      /64 lowercase hex/,
    ],
    [
      [
        "add-evidence",
        "syn-stock-1",
        "--uri",
        "u",
        "--sha256",
        HASH,
        "--description",
        "d",
        "--provenance",
        "independently_verified",
      ],
      /provenance/,
    ],
    [["set-stage", "tnote-a", "delisted", "--note", "n"], /request-delist/],
    [["set-stage", "tfund-a", "nav_strike_window", "--note", "n"], /never set/],
    [["set-flags", "tfund-a", "bond"], /kind must be one of/],
    [["nav", "tfund-a", "--nav", "0"], /positive/],
    [["nav", "tfund-a", "--window-hours", "200"], /1 to 168/],
    [["nav", "tfund-a", "--nav", "1.123456789"], /--nav/],
    [["nav"], /expected/],
  ])("refuses %j", (argv, message) => {
    expect(() => parseActionsArgs(argv as string[])).toThrow(message);
  });

  it("refuses ambiguous times and ratios", () => {
    expect(() => parseTime("2026-11-20 10:00", "x")).toThrow();
    expect(() => parseTime("2026-11-20T10:00:00", "x")).toThrow(/zone/);
    expect(() => parseRatio("0/1", "x")).toThrow();
    expect(() => parseRatio("1/0", "x")).toThrow();
    expect(() => parseRatio("340282366920938463463374607431768211456/1", "x")).toThrow();
  });
});
