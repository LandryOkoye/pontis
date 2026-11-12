import { describe, expect, it } from "vitest";
import { parseDemoSeedArgs } from "../lib/demo-seed.ts";

describe("demo:seed arguments", () => {
  it("defaults to the demo tier, 90 days and the market steps", () => {
    expect(parseDemoSeedArgs([])).toEqual({
      tier: "demo",
      sandboxInfo: undefined,
      testnet: false,
      custody: false,
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
      custody: true,
      days: 30,
      market: false,
    });
    expect(parseDemoSeedArgs(["--testnet"]).testnet).toBe(true);
  });

  it("seeds custody by default on a sandbox for demo and full, and only on request elsewhere", () => {
    const sandbox = ["--sandbox-info", "/tmp/s.json"];
    expect(parseDemoSeedArgs(sandbox).custody).toBe(true);
    expect(parseDemoSeedArgs([...sandbox, "--no-custody"]).custody).toBe(false);
    expect(parseDemoSeedArgs([...sandbox, "--catalogue=mvp"]).custody).toBe(false);
    expect(parseDemoSeedArgs(["--testnet"]).custody).toBe(false);
    expect(parseDemoSeedArgs(["--testnet", "--custody"]).custody).toBe(true);
    expect(() => parseDemoSeedArgs(["--custody", "--no-custody"])).toThrow(/exclude/);
    expect(() => parseDemoSeedArgs(["--custody", "--catalogue=mvp"])).toThrow(
      /demo or --catalogue=full/,
    );
  });

  it("refuses an unknown tier, option, positional or day count", () => {
    expect(() => parseDemoSeedArgs(["--catalogue=huge"])).toThrow(/must be one of/);
    expect(() => parseDemoSeedArgs(["--nope"])).toThrow(/unknown option/);
    expect(() => parseDemoSeedArgs(["extra"])).toThrow(/usage/);
    expect(() => parseDemoSeedArgs(["--days", "0"])).toThrow(/1 to 365/);
    expect(() => parseDemoSeedArgs(["--days", "400"])).toThrow(/1 to 365/);
  });
});
