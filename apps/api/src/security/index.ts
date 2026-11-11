import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { registerRateLimit, type RateLimits } from "./rate-limit.ts";

export type { RateLimits } from "./rate-limit.ts";

export interface SecurityOptions {
  /** Origins allowed to call the API from a browser. Empty allows none. */
  corsOrigins: string[];
  /** Take the client address from `X-Forwarded-For` (behind a reverse proxy only). */
  trustProxy?: boolean;
  /** Omit to leave rate limiting off (tests). */
  rateLimits?: RateLimits;
}

/**
 * CORS, rate limits and response headers for the whole app, 404s included. Plugins load in
 * registration order, so routes must be registered in a plugin queued after this call.
 */
export function registerSecurity(app: FastifyInstance, options: SecurityOptions): void {
  app.register(cors, {
    origin: options.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type", "idempotency-key", "authorization"],
    exposedHeaders: [
      "retry-after",
      "x-ratelimit-limit",
      "x-ratelimit-remaining",
      "x-ratelimit-reset",
    ],
    maxAge: 600,
  });
  if (options.rateLimits) registerRateLimit(app, options.rateLimits);
  app.addHook("onSend", async (req, reply) => {
    void reply.header("x-content-type-options", "nosniff");
    // Admin answers carry vault balances and findings: no shared cache may keep them. `/metrics`
    // exports the same figures.
    const path = req.url.split("?")[0] ?? "";
    if (req.url.startsWith("/v1/admin") || path === "/metrics")
      void reply.header("cache-control", "no-store");
  });
}
