// The legacy break-glass credential (ADR 0019): `Authorization: Bearer <ADMIN_API_KEY>`. With no
// key configured it admits no one. Wallet sessions are checked in `../auth/authorize.ts`.

import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.ts";

const digest = (value: string) => createHash("sha256").update(value).digest();

/** The token of an `Authorization: Bearer <token>` header, or undefined. */
export function bearerToken(authorization: string | undefined): string | undefined {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
}

/** True if `presented` is the configured key. Comparing digests keeps it constant-time. */
export function isLegacyKey(configuredKey: string | undefined, presented: string): boolean {
  return configuredKey !== undefined && timingSafeEqual(digest(configuredKey), digest(presented));
}

export function requireAdmin(
  configuredKey: string | undefined,
  authorization: string | undefined,
): void {
  const presented = bearerToken(authorization);
  if (presented === undefined || !isLegacyKey(configuredKey, presented))
    throw new AppError("UNAUTHORIZED", 401, "A valid admin key is required");
}
