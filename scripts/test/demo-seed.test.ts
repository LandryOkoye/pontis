import { describe, expect, it } from "vitest";
import { parseDemoSeedArgs } from "../lib/demo-seed.ts";

describe("demo:seed arguments", () => {
  it("defaults to the demo tier, 90 days and the market steps", () => {
    expect(parseDemoSeedArgs([])).toEqual({
      tier: "demo",
      sandboxInfo: undefined,
      testnet: false,
      days: 90,
      market: true,
    });
  });

  it("reads the tier, the sandbox file, the days and the switches", () => {
    expect(
      parseDemoSeedArgs([
        "--catalogue=full",
        "--sandbox-info",
        "/tmp/s.json",
        "--days",
        "30",
        "--no-market",
      ]),
    ).toEqual({
      tier: "full",
      sandboxInfo: "/tmp/s.json",
      testnet: false,
      days: 30,
      market: false,
    });
    expect(parseDemoSeedArgs(["--testnet"]).testnet).toBe(true);
  });

  it("refuses an unknown tier, option, positional or day count", () => {
    expect(() => parseDemoSeedArgs(["--catalogue=huge"])).toThrow(/must be one of/);
    expect(() => parseDemoSeedArgs(["--nope"])).toThrow(/unknown option/);
    expect(() => parseDemoSeedArgs(["extra"])).toThrow(/usage/);
    expect(() => parseDemoSeedArgs(["--days", "0"])).toThrow(/1 to 365/);
    expect(() => parseDemoSeedArgs(["--days", "400"])).toThrow(/1 to 365/);
  });
});
