// Cache headers for public reads: a weak ETag over the body, `304` when the client already has it,
// and a short shared-cache lifetime. Admin, health and write routes are left alone.

import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";

const PUBLIC_PREFIXES = ["/v1/assets", "/v1/issuers", "/v1/market", "/v1/search", "/v1/compare"];
const CACHE_CONTROL = "public, max-age=5, stale-while-revalidate=30";

export function registerPublicCaching(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?")[0] ?? "";
    if (
      request.method !== "GET" ||
      reply.statusCode !== 200 ||
      typeof payload !== "string" ||
      !PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
    ) {
      return payload;
    }
    const etag = `W/"${createHash("sha256").update(payload).digest("base64url").slice(0, 27)}"`;
    void reply.header("etag", etag).header("cache-control", CACHE_CONTROL);
    if (request.headers["if-none-match"] === etag) {
      void reply.code(304);
      return "";
    }
    return payload;
  });
}
