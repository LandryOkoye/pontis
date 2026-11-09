import { describe, expect, it } from "vitest";
import { parseOpsArgs } from "../ops.ts";

describe("ops arguments", () => {
  it("parses the commands the runbooks use", () => {
    expect(parseOpsArgs(["status"])).toEqual({ kind: "status" });
    expect(parseOpsArgs(["pause"])).toEqual({ kind: "pause" });
    expect(parseOpsArgs(["pause-asset", "tgold-b"])).toEqual({
      kind: "pause-asset",
      representation: "tgold-b",
    });
    expect(parseOpsArgs(["fund-vault", "tgold-a", "1000000"])).toEqual({
      kind: "fund-vault",
      representation: "tgold-a",
      amount: "1000000",
    });
    expect(parseOpsArgs(["withdraw", "tgold-b", "5", "owner.testnet"])).toEqual({
      kind: "withdraw",
      representation: "tgold-b",
      amount: "5",
      receiver: "owner.testnet",
    });
  });

  it("joins the words of a reason, which is recorded on chain", () => {
    expect(parseOpsArgs(["suspend-pair", "issuer", "reported", "a", "problem"])).toEqual({
      kind: "suspend-pair",
      rationale: "issuer reported a problem",
    });
  });

  it.each([
    [[], /usage/],
    [["explode"], /usage/],
    [["pause-asset", "tgold-c"], /unknown representation/],
    [["suspend-pair"], /needs a reason/],
    [["fund-vault", "tgold-a", "0"], /positive integer/],
    [["fund-vault", "tgold-a", "-3"], /positive integer/],
    [["withdraw", "tgold-a", "5", "Not_Valid"], /invalid receiver/],
    [["withdraw", "tgold-a", "5"], /invalid receiver/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseOpsArgs(argv as string[])).toThrow(message);
  });
});
