import { describe, expect, it } from "vitest";
import { parseAllowlistArgs } from "../allowlist.ts";

describe("allowlist arguments", () => {
  it("parses add and remove for one or all representations", () => {
    expect(parseAllowlistArgs(["add", "all", "a.testnet", "b.testnet"])).toEqual({
      allowed: true,
      representations: ["tgold-a", "tgold-b"],
      accounts: ["a.testnet", "b.testnet"],
    });
    expect(parseAllowlistArgs(["remove", "tgold-b", "a.testnet", "a.testnet"])).toEqual({
      allowed: false,
      representations: ["tgold-b"],
      accounts: ["a.testnet"],
    });
  });

  it.each([
    [[], /usage/],
    [["add", "tgold-c", "a.testnet"], /unknown representation/],
    [["add", "all"], /at least one account/],
    [["add", "all", "Not_Valid"], /invalid NEAR account id/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseAllowlistArgs(argv as string[])).toThrow(message);
  });
});
