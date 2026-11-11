// Wallet sign-in for scripts and tests (ADR 0019): answers the API's NEP-413 challenge with a local
// ed25519 key, the way a wallet's `signMessage` would. Testnet and sandbox keys only: this is a dev
// and e2e tool, and a real operator signs in with a wallet.

import { parseSecretKey, signNep413 } from "@pontis/quote-engine";
import { optional, split, text } from "./arg-parse.ts";
import { ALLOWED_NETWORKS, loadDeployerKey, type NetworkId } from "./config.ts";

export interface LoginOptions {
  /** Base URL of the API, for example `http://127.0.0.1:3000`. */
  apiUrl: string;
  accountId: string;
  /** `ed25519:<base58>` secret key of an access key of `accountId`. */
  secretKey: string;
  fetch?: typeof fetch;
}

export interface Login {
  token: string;
  accountId: string;
  roles: string[];
  keyType: string;
  expiresAt: string;
  maxExpiresAt: string;
}

async function post(doFetch: typeof fetch, url: string, body: unknown): Promise<unknown> {
  const res = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${url} answered ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: Record<string, unknown>, key: string): string => {
  const value = v[key];
  if (typeof value !== "string") throw new Error(`the API's answer has no string "${key}"`);
  return value;
};

/** Signs a fresh challenge and returns the session. Throws with the API's refusal if it says no. */
export async function login(options: LoginOptions): Promise<Login> {
  const doFetch = options.fetch ?? fetch;
  const base = options.apiUrl.replace(/\/+$/, "");
  const key = parseSecretKey(options.secretKey);

  const raw = await post(doFetch, `${base}/v1/auth/challenge`, { accountId: options.accountId });
  if (!isRecord(raw)) throw new Error("the challenge answer is not an object");
  const challenge = {
    nonce: str(raw, "nonce"),
    recipient: str(raw, "recipient"),
    message: str(raw, "message"),
  };
  const signature = signNep413(key, {
    message: challenge.message,
    nonce: Buffer.from(challenge.nonce, "base64"),
    recipient: challenge.recipient,
  });
  const session = await post(doFetch, `${base}/v1/auth/verify`, {
    accountId: options.accountId,
    publicKey: key.publicKey,
    signature,
    nonce: challenge.nonce,
  });
  if (!isRecord(session)) throw new Error("the verify answer is not an object");
  const roles = session.roles;
  if (!Array.isArray(roles) || !roles.every((r) => typeof r === "string"))
    throw new Error(`the API's answer has no roles list`);
  return {
    token: str(session, "token"),
    accountId: str(session, "accountId"),
    roles: roles as string[],
    keyType: str(session, "keyType"),
    expiresAt: str(session, "expiresAt"),
    maxExpiresAt: str(session, "maxExpiresAt"),
  };
}

export interface LoginArgs {
  apiUrl: string;
  accountId: string;
  networkId: NetworkId;
  tokenOnly: boolean;
}

const USAGE = "usage: auth-login --api <url> [--account <id>] [--token-only]";

/**
 * `--api` is required; the account defaults to `DEPLOYER_ACCOUNT_ID`. The network comes from
 * `NEAR_NETWORK_ID` and must be testnet or sandbox: this tool signs with a local key.
 */
export function parseLoginArgs(argv: string[], env: Record<string, string | undefined>): LoginArgs {
  const parsed = split(argv, ["api", "account"], ["token-only"]);
  if (parsed.positionals.length > 0) throw new Error(USAGE);
  const apiUrl = text(parsed, "api");
  if (!/^https?:\/\//.test(apiUrl)) throw new Error("--api must be an http(s) URL");
  const accountId = optional(parsed, "account") ?? env.DEPLOYER_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error("--account is required (or set DEPLOYER_ACCOUNT_ID)");
  const networkId = (env.NEAR_NETWORK_ID?.trim() || "testnet") as NetworkId;
  if (!ALLOWED_NETWORKS.includes(networkId))
    throw new Error(
      `NEAR_NETWORK_ID must be one of ${ALLOWED_NETWORKS.join(", ")}; this tool signs with a local key`,
    );
  return { apiUrl, accountId, networkId, tokenOnly: parsed.flags.get("token-only") === true };
}

/** The signing key: `DEPLOYER_PRIVATE_KEY`, or the NEAR CLI credentials file of the account. */
export const secretKeyFor = (args: LoginArgs, env: Record<string, string | undefined>) =>
  loadDeployerKey(env, args.networkId, args.accountId);
