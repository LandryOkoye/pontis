import { describe, expect, it } from "vitest";
import { devKey } from "../src/index.ts";

describe("devKey", () => {
  it("derives the same published key on every machine", () => {
    // Pinned: other components and docs name this key, so a change in derivation must be deliberate.
    expect(devKey("price-publisher").publicKey).toBe(
      "ed25519:9BEGohQ6Mps1hQm3PEA32bchG1MJbnSJpP7cJ81hDwSB",
    );
  });
});
