// Per-client rate limits by request class (brief §10.1): admin calls are the tightest because a
// wrong key is a guess, writes cost a database transaction and a signature, reads are cheap.

import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../errors.ts";

export interface RateLimits {
  /** Requests allowed per client per window, for each class. */
  read: number;
  write: number;
  admin: number;
  windowMs: number;
}

type RequestClass = "read" | "write" | "admin";

/** Sign-in attempts are guesses at a credential, so they take the admin allowance (ADR 0019). */
export function isSignIn(req: Pick<FastifyRequest, "url">): boolean {
  const path = req.url.split("?")[0] ?? "";
  return path === "/v1/auth/challenge" || path === "/v1/auth/verify";
}

export function classify(req: Pick<FastifyRequest, "method" | "url">): RequestClass {
  const path = req.url.split("?")[0] ?? "";
  if (path.startsWith("/v1/admin") || isSignIn(req)) return "admin";
  return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS"
    ? "read"
    : "write";
}

export function registerRateLimit(app: FastifyInstance, limits: RateLimits): void {
  app.register(rateLimit, {
    global: true,
    timeWindow: limits.windowMs,
    max: (req) => limits[classify(req)],
    // One counter per client and class: heavy reading must not use up the write allowance.
    // Sign-in has its own counter, so an operator's dashboard polling cannot lock them out of it.
    keyGenerator: (req) => `${isSignIn(req) ? "sign-in" : classify(req)}:${req.ip}`,
    errorResponseBuilder: (_req, context) =>
      new AppError("RATE_LIMITED", 429, `Too many requests; retry in ${context.after}`),
  });
}
