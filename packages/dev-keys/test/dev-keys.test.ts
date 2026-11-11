import { parseSecretKey } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import { DEV_KEY_ROLES, devKey, devSecretKey } from "../src/index.ts";

describe("devKey", () => {
  it("derives the same published key on every machine", () => {
    // Pinned: other components and docs name these keys, so a change in derivation must be deliberate.
    expect(devKey("price-publisher").publicKey).toBe(
      "ed25519:9BEGohQ6Mps1hQm3PEA32bchG1MJbnSJpP7cJ81hDwSB",
    );
    expect(devKey("reserve-attester").publicKey).toBe(
      "ed25519:4kMKwAzDWxTZzGPAfp9HFg2e7r9BFzpH3E51T2HaVhNm",
    );
    expect(devKey("issuer-backoffice").publicKey).toBe(
      "ed25519:6qm5vvyuMtoYmHtn4ccTcK4ncgrkDStpmofDFFKC1Veu",
    );
  });

  it("gives every role a different key", () => {
    const keys = DEV_KEY_ROLES.map((role) => devKey(role).publicKey);
    expect(new Set(keys).size).toBe(DEV_KEY_ROLES.length);
  });

  it("exports the NEAR secret key that matches the public key", () => {
    for (const role of DEV_KEY_ROLES) {
      expect(parseSecretKey(devSecretKey(role)).publicKey).toBe(devKey(role).publicKey);
    }
  });
});
