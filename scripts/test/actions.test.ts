import { describe, expect, it } from "vitest";
import { approverChain } from "../actions.ts";

describe("approver account", () => {
  it("is the deployer unless a second account is configured", () => {
    const chain = { config: { deployerId: "a.testnet" } } as never;
    expect(approverChain(chain, {})).toBe(chain);
  });
});
