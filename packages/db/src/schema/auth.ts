// Wallet sign-in (ADR 0019): single-use NEP-413 challenges and sessions. A session token is never
// stored, only its SHA-256, so a database read cannot be replayed as a login.

import type { AuthKeyType } from "@pontis/api-types";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const authChallenges = pgTable("auth_challenges", {
  /** Base64 of the 32 random bytes the wallet signs over. */
  nonce: text().primaryKey(),
  accountId: text().notNull(),
  /** The exact message the wallet was asked to sign. */
  message: text().notNull(),
  recipient: text().notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
  expiresAt: at("expires_at").notNull(),
  /** Set by the one `verify` that used it; a nonce with a value here is never accepted again. */
  consumedAt: at("consumed_at"),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    /** Hex SHA-256 of the opaque token. */
    tokenHash: text().primaryKey(),
    accountId: text().notNull(),
    /** The access key that signed the challenge. */
    publicKey: text().notNull(),
    keyType: text().$type<AuthKeyType>().notNull(),
    /** The role set read from the chain at `rolesReadAt`; refreshed after 60 seconds. */
    roles: jsonb().$type<string[]>().notNull(),
    rolesReadAt: at("roles_read_at").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    /** Slides forward with use, never past `maxExpiresAt`. */
    expiresAt: at("expires_at").notNull(),
    maxExpiresAt: at("max_expires_at").notNull(),
    revokedAt: at("revoked_at"),
  },
  (t) => [index("auth_sessions_account_idx").on(t.accountId)],
);
