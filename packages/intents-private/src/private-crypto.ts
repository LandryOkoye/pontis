import { createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";

export type Side = "buy" | "sell";
export type PrivateOrder = {
  id: string;
  institutionId: string;
  assetId: string;
  side: Side;
  size: string;
  /** Price in quote-asset minor units per whole asset unit. */
  limitPrice: string;
  expiryMs: number;
  createdAtMs: number;
};
export type EncryptedOrder = { ciphertext: string; ephemeralPublicKey: string; nonce: string };
export type RfqKeys = { publicKey: Uint8Array; secretKey: Uint8Array };
export type MatchDisclosure = {
  buyOrder: PrivateOrder;
  sellOrder: PrivateOrder;
  size: string;
  price: string;
  salt: string;
};

export function createRfqKeys(): RfqKeys {
  return nacl.box.keyPair();
}

/** Encrypt orders to the matcher with TweetNaCl's authenticated X25519 box. */
export function encryptOrder(order: PrivateOrder, matcherPublicKey: Uint8Array): EncryptedOrder {
  const ephemeral = nacl.box.keyPair();
  const nonce = randomBytes(nacl.box.nonceLength);
  const cleartext = new TextEncoder().encode(JSON.stringify(order));
  return encode(
    nacl.box(cleartext, nonce, matcherPublicKey, ephemeral.secretKey),
    ephemeral.publicKey,
    nonce,
  );
}

export function decryptOrder(encrypted: EncryptedOrder, keys: RfqKeys): PrivateOrder {
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const ephemeralPublicKey = Buffer.from(encrypted.ephemeralPublicKey, "base64");
  const nonce = Buffer.from(encrypted.nonce, "base64");
  if (
    nonce.length !== nacl.box.nonceLength ||
    ephemeralPublicKey.length !== nacl.box.publicKeyLength
  ) {
    throw new Error("Malformed encrypted order");
  }
  const cleartext = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, keys.secretKey);
  if (!cleartext) throw new Error("Encrypted order authentication failed");
  return parseOrder(JSON.parse(new TextDecoder().decode(cleartext)) as unknown);
}

export function sealDisclosure(
  value: MatchDisclosure,
  recipientPublicKey: Uint8Array,
): EncryptedOrder {
  const ephemeral = nacl.box.keyPair();
  const nonce = randomBytes(nacl.box.nonceLength);
  const cleartext = new TextEncoder().encode(JSON.stringify(value));
  return encode(
    nacl.box(cleartext, nonce, recipientPublicKey, ephemeral.secretKey),
    ephemeral.publicKey,
    nonce,
  );
}

export function openDisclosure(blob: EncryptedOrder, secretKey: Uint8Array): MatchDisclosure {
  const cleartext = nacl.box.open(
    Buffer.from(blob.ciphertext, "base64"),
    Buffer.from(blob.nonce, "base64"),
    Buffer.from(blob.ephemeralPublicKey, "base64"),
    secretKey,
  );
  if (!cleartext) throw new Error("Disclosure authentication failed");
  return JSON.parse(new TextDecoder().decode(cleartext)) as MatchDisclosure;
}

export function matchCommitment(value: MatchDisclosure): string {
  const canonical = JSON.stringify({
    buyOrder: value.buyOrder,
    sellOrder: value.sellOrder,
    size: value.size,
    price: value.price,
    salt: value.salt,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function encode(ciphertext: Uint8Array, publicKey: Uint8Array, nonce: Uint8Array): EncryptedOrder {
  return {
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    ephemeralPublicKey: Buffer.from(publicKey).toString("base64"),
    nonce: Buffer.from(nonce).toString("base64"),
  };
}

function parseOrder(value: unknown): PrivateOrder {
  if (typeof value !== "object" || value === null) throw new Error("Malformed order");
  const order = value as Partial<PrivateOrder>;
  if (
    typeof order.id !== "string" ||
    typeof order.institutionId !== "string" ||
    typeof order.assetId !== "string" ||
    (order.side !== "buy" && order.side !== "sell") ||
    typeof order.size !== "string" ||
    typeof order.limitPrice !== "string" ||
    typeof order.expiryMs !== "number" ||
    typeof order.createdAtMs !== "number"
  )
    throw new Error("Malformed order");
  if (
    !order.id ||
    !order.assetId ||
    !order.institutionId ||
    !/^\d+$/.test(order.size) ||
    !/^\d+$/.test(order.limitPrice) ||
    BigInt(order.size) <= 0n ||
    BigInt(order.limitPrice) <= 0n
  ) {
    throw new Error("Invalid order fields");
  }
  return order as PrivateOrder;
}
