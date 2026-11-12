import { base58Decode, base58Encode, keyFromSeed, verifyNep413 } from "@pontis/quote-engine";
import { describe, expect, it } from "vitest";
import { login, parseLoginArgs } from "../lib/auth-login.ts";

const seed = Buffer.alloc(32, 5);
const key = keyFromSeed(seed);
// NEAR tools write a secret key as ed25519:<base58 of seed then public key>.
const secretKey = `ed25519:${base58Encode(
  Buffer.concat([seed, base58Decode(key.publicKey.slice("ed25519:".length))]),
)}`;

/** An API that issues one challenge and checks the signature the way the real one does. */
function fakeApi() {
  const nonce = Buffer.alloc(32, 9);
  const challenge = {
    accountId: "alice.testnet",
    nonce: nonce.toString("base64"),
    recipient: "pontis-api.sandbox",
    message: "Sign in to the Pontis API as alice.testnet.",
    expiresAt: "2026-11-11T12:05:00.000Z",
  };
  const seen: { url: string; body: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    seen.push({ url, body });
    const reply = (status: number, json: unknown) =>
      ({ ok: status < 400, status, json: async () => json }) as Response;
    if (url.endsWith("/v1/auth/challenge")) return reply(200, challenge);
    const valid = verifyNep413(
      { message: challenge.message, nonce, recipient: challenge.recipient },
      body.publicKey as string,
      body.signature as string,
    );
    if (!valid || body.nonce !== challenge.nonce)
      return reply(401, { code: "UNAUTHORIZED", message: "no" });
    return reply(200, {
      token: "tok",
      tokenType: "Bearer",
      accountId: body.accountId,
      roles: ["owner"],
      keyType: "full_access",
      expiresAt: "2026-11-11T12:15:00.000Z",
      maxExpiresAt: "2026-11-11T20:00:00.000Z",
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe("login", () => {
  it("answers the challenge with a NEP-413 signature over the recipient and nonce it was given", async () => {
    const { fetchImpl, seen } = fakeApi();
    const session = await login({
      apiUrl: "http://api.test/",
      accountId: "alice.testnet",
      secretKey,
      fetch: fetchImpl,
    });
    expect(session).toMatchObject({ token: "tok", roles: ["owner"], keyType: "full_access" });
    expect(seen.map((s) => s.url)).toEqual([
      "http://api.test/v1/auth/challenge",
      "http://api.test/v1/auth/verify",
    ]);
    expect(seen[1]?.body.publicKey).toBe(key.publicKey);
  });

  it("raises the API's refusal, with the status", async () => {
    const refusing = (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({ code: "UNAUTHORIZED" }),
      }) as Response) as unknown as typeof fetch;
    await expect(
      login({ apiUrl: "http://api.test", accountId: "a.testnet", secretKey, fetch: refusing }),
    ).rejects.toThrow(/401/);
  });
});

describe("parseLoginArgs", () => {
  const env = { DEPLOYER_ACCOUNT_ID: "dep.testnet", NEAR_NETWORK_ID: "sandbox" };

  it("defaults the account to the deployer and reads the flags", () => {
    expect(parseLoginArgs(["--api", "http://127.0.0.1:3000", "--token-only"], env)).toEqual({
      apiUrl: "http://127.0.0.1:3000",
      accountId: "dep.testnet",
      networkId: "sandbox",
      tokenOnly: true,
    });
    expect(
      parseLoginArgs(["--api", "https://a.example", "--account", "bob.testnet"], env),
    ).toMatchObject({
      accountId: "bob.testnet",
      tokenOnly: false,
    });
  });

  it("refuses a missing API, a non-http URL, no account, mainnet and stray arguments", () => {
    expect(() => parseLoginArgs([], env)).toThrow(/--api/);
    expect(() => parseLoginArgs(["--api", "ftp://x"], env)).toThrow(/http/);
    expect(() => parseLoginArgs(["--api", "http://x"], {})).toThrow(/--account/);
    expect(() =>
      parseLoginArgs(["--api", "http://x"], { ...env, NEAR_NETWORK_ID: "mainnet" }),
    ).toThrow(/testnet, sandbox/);
    expect(() => parseLoginArgs(["extra", "--api", "http://x"], env)).toThrow(/usage/);
  });
});
