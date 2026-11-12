import { expect, it } from "vitest";
import { createRfqKeys, decryptOrder, encryptOrder, type PrivateOrder } from "../src/private-crypto.ts";

it("encrypts orders to the matcher key and rejects modified ciphertext", () => {
  const keys = createRfqKeys();
  const order: PrivateOrder = {
    id: "order-1", institutionId: "institution", assetId: "sim:asset", side: "buy",
    size: "10", limitPrice: "100", expiryMs: 2_000, createdAtMs: 1_000,
  };
  const encrypted = encryptOrder(order, keys.publicKey);
  expect(decryptOrder(encrypted, keys)).toEqual(order);
  const damaged = { ...encrypted, ciphertext: `A${encrypted.ciphertext.slice(1)}` };
  expect(() => decryptOrder(damaged, keys)).toThrow(/authentication/);
});
