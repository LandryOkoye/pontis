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

  it("documents the MVP routes and the registered Phase 8 adapter routes", () => {
    const doc = buildOpenApiDocument();
    const actual = Object.entries(doc.paths ?? {})
      .flatMap(([path, item]) =>
        Object.keys(item as object).map((m) => `${m.toUpperCase()} ${path}`),
      )
      .sort();
    expect(actual).toEqual(
      [
        "GET /v1/health",
        "GET /v1/issuers",
        "GET /v1/issuers/{id}",
        "GET /v1/assets",
        "GET /v1/assets/{id}",
        "GET /v1/assets/{id}/compatibility",
        "GET /v1/intents/tokens",
        "GET /v1/intents/status",
        "GET /v1/private-rfq/matcher-key",
        "GET /v1/private-rfq/settlements/{settlementId}/disclosure",
        "POST /v1/routes/compare",
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
      ].sort(),
    );
  });

  it("requires a header only where one is defined: Idempotency-Key on conversions, a bearer key on admin", () => {
    const withHeader = Object.values(ENDPOINTS).filter((e) => "headers" in e);
    expect(withHeader.map((e) => e.path)).toEqual(["/v1/conversions", "/v1/admin/reconciliation"]);
  });

  it("gives every endpoint a structured error response for failures", () => {
    const doc = JSON.parse(JSON.stringify(buildOpenApiDocument()));
    for (const [path, item] of Object.entries<
      Record<string, { responses: Record<string, unknown> }>
    >(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        const errors = Object.keys(op.responses).filter((s) => Number(s) >= 400);
        expect(errors.length, `${method} ${path}`).toBeGreaterThan(0);
        for (const s of errors) {
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
