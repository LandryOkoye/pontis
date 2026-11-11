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

  it("documents exactly the BuildPlan §8 endpoints plus the admin reconciliation and metrics endpoints", () => {
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
        "GET /v1/assets/{id}/charts/price",
        "GET /v1/assets/{id}/charts/nav",
        "GET /v1/assets/{id}/charts/supply",
        "GET /v1/assets/{id}/charts/volume",
        "GET /v1/assets/{id}/metadata",
        "GET /v1/assets/{id}/issuer",
        "GET /v1/assets/{id}/chains",
        "GET /v1/assets/{id}/documents",
        "GET /v1/assets/{id}/activity",
        "GET /v1/compare",
        "GET /v1/search",
        "GET /v1/issuers/leaderboard",
        "GET /v1/status",
        "GET /v1/market/overview",
        "GET /v1/market/movers",
        "GET /v1/market/categories",
        "GET /v1/market/chains",
        "POST /v1/routes/compare",
        "POST /v1/quotes",
        "GET /v1/quotes/{id}",
        "POST /v1/conversions",
        "POST /v1/conversions/{id}/submitted",
        "GET /v1/transactions/{id}",
        "GET /v1/transactions",
        "GET /v1/admin/reconciliation",
        "GET /v1/metrics/protocol",
        "GET /v1/admin/metrics",
        "GET /metrics",
      ].sort(),
    );
  });

  it("requires a header only where one is defined: Idempotency-Key on conversions, a bearer key on admin", () => {
    const withHeader = Object.values(ENDPOINTS).filter((e) => "headers" in e);
    expect(withHeader.map((e) => e.path)).toEqual([
      "/v1/conversions",
      "/v1/admin/reconciliation",
      "/v1/admin/metrics",
      "/metrics",
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
});
