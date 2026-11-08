import { describe, expect, it } from "vitest";
import { deployerKeyProblem } from "../lib/chain.ts";

describe("deployerKeyProblem", () => {
  const keys = ["ed25519:AAA", "ed25519:BBB"];

  it("accepts a full-access key of the account", () => {
    expect(deployerKeyProblem("ed25519:BBB", "pontis.testnet", keys)).toBeUndefined();
  });

  it("names the configured key and the account's real keys when they differ", () => {
    const problem = deployerKeyProblem("ed25519:ZZZ", "pontis.testnet", keys);
    expect(problem).toContain("ed25519:ZZZ");
    expect(problem).toContain("pontis.testnet");
    expect(problem).toContain("ed25519:AAA, ed25519:BBB");
  });

  it("says so when the account has no full-access key", () => {
    expect(deployerKeyProblem("ed25519:ZZZ", "x.testnet", [])).toContain("none");
  });
});
