// Cache headers for public reads: a weak ETag over the body, `304` when the client already has it,
// and a short shared-cache lifetime. Admin, `/metrics`, health and write routes are left alone.

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";

const PUBLIC_PREFIXES = [
  "/v1/assets",
  "/v1/issuers",
  "/v1/market",
  "/v1/search",
  "/v1/compare",
  "/v1/custodians",
  "/v1/redemptions",
];
const CACHE_CONTROL = "public, max-age=5, stale-while-revalidate=30";
/** Protocol metrics are aggregates over rolling windows: 30 s stale is fine and spares the database. */
const METRICS_PREFIX = "/v1/metrics";
const METRICS_CACHE_CONTROL = "public, max-age=30";

export function registerPublicCaching(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?")[0] ?? "";
    const underPrefix = (p: string) => path === p || path.startsWith(`${p}/`);
    const cacheControl = underPrefix(METRICS_PREFIX)
      ? METRICS_CACHE_CONTROL
      : PUBLIC_PREFIXES.some(underPrefix)
        ? CACHE_CONTROL
        : undefined;
    if (
      request.method !== "GET" ||
      reply.statusCode !== 200 ||
      typeof payload !== "string" ||
      cacheControl === undefined
    ) {
      return payload;
    }
    const etag = `W/"${createHash("sha256").update(payload).digest("base64url").slice(0, 27)}"`;
    void reply.header("etag", etag).header("cache-control", cacheControl);
    if (request.headers["if-none-match"] === etag) {
      void reply.code(304);
      return "";
    }
    return payload;
  });
}
