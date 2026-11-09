// Admin endpoints take `Authorization: Bearer <ADMIN_API_KEY>`. With no key configured they are
// closed to everyone. B14 adds rate limiting and an audit trail on top of this check.

import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.ts";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function requireAdmin(
  configuredKey: string | undefined,
  authorization: string | undefined,
): void {
  const presented = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  // Comparing digests keeps the check constant-time whatever the lengths are.
  const ok =
    configuredKey !== undefined &&
    presented !== undefined &&
    timingSafeEqual(digest(configuredKey), digest(presented));
  if (!ok) throw new AppError("UNAUTHORIZED", 401, "A valid admin key is required");
}
