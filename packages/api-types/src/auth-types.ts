// Wallet sign-in (ADR 0019 section 2): a NEP-413 challenge, a verify that opens a session, and
// the session's own endpoints. The session token is opaque; send it as `Authorization: Bearer`.

import { z } from "zod";
import { AccountId, Timestamp } from "./common.ts";

/** The contract's roles, as `get_account_roles` names them (snake_case; `owner` for the owner). */
export const ROLE_NAMES = [
  "owner",
  "registrar",
  "compat_approver",
  "pauser",
  "attester",
  "reserve_attester",
  "bridge_attester",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
export const RoleNameSchema = z.enum(ROLE_NAMES).meta({
  id: "RoleName",
  description:
    "A role held on pontis-core. `owner` is listed when the account is the contract owner.",
});

const Base64Nonce = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .meta({ description: "32 random bytes, base64 (44 characters)." });

export const AuthSessionHeaderSchema = z.object({
  authorization: z.string().meta({
    description: "`Bearer <session token>` from `POST /v1/auth/verify`.",
    example: "Bearer 3q2-7wJpVx0mTtHn2l1u9QJb7Gm8m2uQhQK0m8h3k1c",
  }),
});

export const AuthChallengeRequestSchema = z
  .object({ accountId: AccountId })
  .meta({ id: "AuthChallengeRequest" });

export const AuthChallengeResponseSchema = z
  .object({
    accountId: AccountId,
    /** Single use; valid until `expiresAt`. */
    nonce: Base64Nonce,
    /** Pass to the wallet's `signMessage` as `recipient`. */
    recipient: z.string(),
    /** Pass to the wallet's `signMessage` as `message`, byte for byte. */
    message: z.string(),
    expiresAt: Timestamp,
  })
  .meta({
    id: "AuthChallengeResponse",
    description:
      "Call the wallet's NEP-413 `signMessage({ message, recipient, nonce })` with `nonce` decoded from base64 to its 32 bytes, then send the result to `POST /v1/auth/verify`.",
  });

export const AuthVerifyRequestSchema = z
  .object({
    accountId: AccountId,
    /** The `publicKey` the wallet returned: `ed25519:<base58>`. */
    publicKey: z
      .string()
      .regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/)
      .meta({ example: "ed25519:6TupyNrcHGTt5XRLmHTc2KGaiSbjhQi1KHtCXTgbcr4Y" }),
    /** The `signature` the wallet returned, base64 of 64 bytes. */
    signature: z
      .string()
      .regex(/^[A-Za-z0-9+/]{86}==$/)
      .meta({ description: "Base64 of the 64-byte ed25519 signature." }),
    /** The challenge's `nonce`, unchanged. */
    nonce: Base64Nonce,
    /**
     * Only when the wallet signed over a callback URL (browser wallets default to the page URL
     * when none is passed): the same string it signed, so the payload can be rebuilt.
     */
    callbackUrl: z.string().min(1).max(2048).optional(),
  })
  .meta({ id: "AuthVerifyRequest" });

export const AuthKeyTypeSchema = z.enum(["full_access", "function_call"]).meta({
  id: "AuthKeyType",
  description:
    "The kind of access key that signed. NEP-413 asks for a full-access key; a function-call key proves the account issued it, and is accepted but recorded.",
});

export type AuthKeyType = z.infer<typeof AuthKeyTypeSchema>;

export const AuthVerifyResponseSchema = z
  .object({
    /** Opaque. Shown once; the server keeps only a hash. */
    token: z.string(),
    tokenType: z.literal("Bearer"),
    accountId: AccountId,
    /** Roles read from the chain at sign-in; `[]` is a valid sign-in with no admin rights. */
    roles: z.array(RoleNameSchema),
    keyType: AuthKeyTypeSchema,
    /** Slides forward with each authenticated request, up to `maxExpiresAt`. */
    expiresAt: Timestamp,
    /** The session ends here whatever its use. */
    maxExpiresAt: Timestamp,
  })
  .meta({ id: "AuthVerifyResponse" });

export const AuthMeResponseSchema = z
  .object({
    accountId: AccountId,
    roles: z.array(RoleNameSchema),
    expiresAt: Timestamp,
  })
  .meta({ id: "AuthMeResponse" });

export const AuthLogoutResponseSchema = z
  .object({ revoked: z.literal(true) })
  .meta({ id: "AuthLogoutResponse" });
