import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ENDPOINTS, buildOpenApiDocument } from "../src/index.ts";

const specPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));

describe("openapi.yaml", () => {
  it("is up to date with the Zod schemas (run `pnpm --filter @pontis/api-types generate`)", () => {
    const committed = parse(readFileSync(specPath, "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));
  });

  it("is a valid OpenAPI 3.1 document", async () => {
    await expect(SwaggerParser.validate(specPath)).resolves.toBeTruthy();
  });

  it("documents exactly the BuildPlan §8 endpoints plus the admin reconciliation, metrics and registered Phase 8 adapter endpoints", () => {
    const doc = buildOpenApiDocument();
    const actual = Object.entries(doc.paths ?? {})
      .flatMap(([path, item]) =>
        Object.keys(item as object).map((m) => `${m.toUpperCase()} ${path}`),
      )
      .sort();
    expect(actual).toEqual(
      [
        "GET /v1/health",
        "GET /v1/health/live",
        "GET /v1/health/ready",
        "GET /v1/issuers",
        "GET /v1/issuers/{id}",
        "GET /v1/assets",
        "GET /v1/assets/{id}",
        "GET /v1/assets/{id}/compatibility",
        "GET /v1/intents/tokens",
        "GET /v1/intents/status",
        "GET /v1/private-rfq/matcher-key",
        "GET /v1/private-rfq/settlements/{settlementId}/disclosure",
        "GET /v1/assets/{id}/charts/price",
        "GET /v1/assets/{id}/charts/nav",
        "GET /v1/assets/{id}/charts/supply",
        "GET /v1/assets/{id}/charts/volume",
        "GET /v1/assets/{id}/metadata",
        "GET /v1/assets/{id}/issuer",
        "GET /v1/assets/{id}/chains",
        "GET /v1/assets/{id}/documents",
        "GET /v1/assets/{id}/activity",
        "GET /v1/assets/{id}/lifecycle",
        "GET /v1/assets/{id}/corporate-actions",
        "GET /v1/assets/{id}/nav",
        "GET /v1/custodians",
        "GET /v1/custodians/{id}",
        "GET /v1/assets/{id}/custody",
        "GET /v1/assets/{id}/reserves",
        "GET /v1/assets/{id}/reserves/history",
        "GET /v1/assets/{id}/redemption-terms",
        "GET /v1/issuers/{id}/reliability",
        "GET /v1/redemptions",
        "GET /v1/redemptions/{id}",
        "POST /v1/reserves/attestations",
        "POST /v1/redemptions/prepare",
        "POST /v1/redemptions/{id}/reclaim-intent",
        "GET /v1/issuer/redemptions",
        "POST /v1/issuer/redemptions/{id}/accept",
        "POST /v1/issuer/redemptions/{id}/reject",
        "POST /v1/issuer/redemptions/{id}/fulfil",
        "GET /v1/issuer/mint-requests",
        "POST /v1/issuer/mint-requests",
        "POST /v1/issuer/mint-requests/{id}/execute",
        "GET /v1/admin/reserve-monitor",
        "GET /v1/compare",
        "GET /v1/search",
        "GET /v1/issuers/leaderboard",
        "GET /v1/status",
        "GET /v1/market/overview",
        "GET /v1/market/movers",
        "GET /v1/market/categories",
        "GET /v1/market/chains",
        "POST /v1/routes/compare",
        "GET /v1/routes/{fromId}/{toId}/guards",
        "POST /v1/quotes",
        "POST /v1/intents/quote",
        "POST /v1/intents/swaps",
        "POST /v1/private-rfq/orders",
        "GET /v1/quotes/{id}",
        "POST /v1/conversions",
        "POST /v1/conversions/{id}/submitted",
        "GET /v1/transactions/{id}",
        "GET /v1/transactions",
        "GET /v1/admin/reconciliation",
        "GET /v1/metrics/protocol",
        "GET /v1/admin/metrics",
        "GET /metrics",
        "POST /v1/auth/challenge",
        "POST /v1/auth/verify",
        "POST /v1/auth/logout",
        "GET /v1/auth/me",
      ].sort(),
    );
  });

  it("requires a header only where one is defined: Idempotency-Key on conversions, a bearer key on admin", () => {
    const withHeader = Object.values(ENDPOINTS).filter((e) => "headers" in e);
    expect(withHeader.map((e) => e.path)).toEqual([
      "/v1/redemptions/prepare",
      "/v1/redemptions/{id}/reclaim-intent",
      "/v1/conversions",
      "/v1/admin/reconciliation",
      "/v1/issuer/redemptions",
      "/v1/issuer/redemptions/{id}/accept",
      "/v1/issuer/redemptions/{id}/reject",
      "/v1/issuer/redemptions/{id}/fulfil",
      "/v1/issuer/mint-requests",
      "/v1/issuer/mint-requests",
      "/v1/issuer/mint-requests/{id}/execute",
      "/v1/admin/reserve-monitor",
      "/v1/admin/metrics",
      "/metrics",
      "/v1/auth/logout",
      "/v1/auth/me",
    ]);
  });

  it("gives every endpoint a structured error response for failures, except declared failureResponses", () => {
    const declared = new Set(
      Object.values(ENDPOINTS).flatMap((e) =>
        Object.keys("failureResponses" in e ? e.failureResponses : {}).map(
          (status) => `${e.method} ${e.path} ${status}`,
        ),
      ),
    );
    const doc = JSON.parse(JSON.stringify(buildOpenApiDocument()));
    for (const [path, item] of Object.entries<
      Record<string, { responses: Record<string, unknown> }>
    >(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        const errors = Object.keys(op.responses).filter((s) => Number(s) >= 400);
        expect(errors.length, `${method} ${path}`).toBeGreaterThan(0);
        for (const s of errors) {
          if (declared.has(`${method} ${path} ${s}`)) continue;
          expect(JSON.stringify(op.responses[s])).toContain("#/components/schemas/ApiError");
        }
      }
    }
  });

  it("keeps Phase 8 paths and operations explicit in the endpoint map", () => {
    expect(ENDPOINTS.createIntentQuote.path).toBe("/v1/intents/quote");
    expect(ENDPOINTS.submitPrivateRfqOrder.method).toBe("post");
    expect(ENDPOINTS.getPrivateRfqDisclosure.query).toBeDefined();
  });
});
