// MSW handlers for every endpoint in BuildPlan §8, backed by the in-memory mock database.
import { HttpResponse, delay, http } from "msw";
import { config } from "../lib/config.ts";
import type { ChartRange } from "../lib/market-types.ts";
import { MockRefusal, db } from "./db.ts";
import * as market from "./market.ts";

const url = (path: string) => `${config.apiUrl}${path}`;
const LATENCY_MS = import.meta.env.MODE === "test" ? 0 : 260;

/** Runs a handler body, turning `MockRefusal` into the API's structured error envelope. */
async function answer(run: () => unknown, status = 200): Promise<Response> {
  await delay(LATENCY_MS);
  try {
    return HttpResponse.json(run() as Record<string, unknown>, { status });
  } catch (error) {
    if (error instanceof MockRefusal) {
      return HttpResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return HttpResponse.json(
      { code: "INTERNAL", message: "Mock handler failed." },
      { status: 500 },
    );
  }
}

interface QuoteBody {
  fromId: string;
  toId: string;
  amountIn: string;
  accountId: string;
}

export const handlers = [
  http.get(url("/v1/health"), () => answer(() => db.health())),
  http.get(url("/v1/issuers"), () => answer(() => ({ items: db.issuers() }))),
  http.get(url("/v1/issuers/:id"), ({ params }) => answer(() => db.issuer(String(params.id)))),
  http.get(url("/v1/assets"), () => answer(() => ({ items: db.assets() }))),
  http.get(url("/v1/assets/:id"), ({ params }) => answer(() => db.asset(String(params.id)))),
  http.get(url("/v1/market/assets"), () =>
    answer(() => ({ items: db.assets().map((a) => market.row(db.asset(a.id))) })),
  ),
  http.get(url("/v1/market/assets/:id"), ({ params }) =>
    answer(() => {
      const asset = db.asset(String(params.id));
      const relations = db.compatibility(asset.id);
      const parity = new Set(relations.filter((r) => r.parityEnabled).map((r) => r.counterpartId));
      const others = db
        .assets()
        .filter((a) => a.id !== asset.id)
        .map((a) => db.asset(a.id));
      return market.detail(asset, others, parity);
    }),
  ),
  http.get(url("/v1/market/assets/:id/chart"), ({ params, request }) => {
    const range = (new URL(request.url).searchParams.get("range") ?? "24h") as ChartRange;
    return answer(() => market.chart(db.asset(String(params.id)), range));
  }),
  http.get(url("/v1/assets/:id/compatibility"), ({ params }) =>
    answer(() => ({ items: db.compatibility(String(params.id)) })),
  ),
  http.post(url("/v1/routes/compare"), async ({ request }) => {
    const body = (await request.json()) as { fromId: string; toId: string; amount?: string };
    return answer(() => db.compare(body.fromId, body.toId, body.amount));
  }),
  http.post(url("/v1/quotes"), async ({ request }) => {
    const body = (await request.json()) as QuoteBody;
    return answer(() => db.createQuote(body.fromId, body.toId, body.amountIn, body.accountId), 201);
  }),
  http.get(url("/v1/quotes/:id"), ({ params }) => answer(() => db.quote(String(params.id)))),
  http.post(url("/v1/conversions"), async ({ request }) => {
    const body = (await request.json()) as { quoteId: string };
    const key = request.headers.get("idempotency-key") ?? "";
    return answer(() => db.createConversion(body.quoteId, key), 201);
  }),
  http.post(url("/v1/conversions/:id/submitted"), async ({ request, params }) => {
    const body = (await request.json()) as { txHash: string };
    return answer(() => db.markSubmitted(String(params.id), body.txHash));
  }),
  http.get(url("/v1/transactions/:id"), ({ params }) =>
    answer(() => db.transaction(String(params.id))),
  ),
  http.get(url("/v1/transactions"), ({ request }) => {
    const account = new URL(request.url).searchParams.get("account") ?? "";
    return answer(() => ({ items: db.transactions(account) }));
  }),
  http.get(url("/v1/admin/reconciliation"), async ({ request }) => {
    const key = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (key.length < 16) {
      await delay(LATENCY_MS);
      return HttpResponse.json(
        { code: "UNAUTHORIZED", message: "Missing or wrong admin key." },
        { status: 401 },
      );
    }
    return answer(() => db.reconciliation());
  }),
];
