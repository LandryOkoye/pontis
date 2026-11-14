// MSW handlers for every endpoint in BuildPlan §8, backed by the in-memory mock database.
import { HttpResponse, delay, http } from "msw";
import { config } from "../lib/config.ts";
import { MockRefusal, db } from "./db.ts";
import { lendingHandlers } from "./lending-handlers.ts";
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
  ...lendingHandlers,
  http.get(url("/v1/health"), () => answer(() => db.health())),
  http.get(url("/v1/intents/tokens"), () =>
    answer(() => ({
      assets: [],
      source: "simulated_intents",
      simulated: true,
    })),
  ),
  http.post(url("/v1/intents/quote"), () =>
    answer(() => ({
      quoteId: "sim-intents-panel",
      amountIn: "1000000",
      amountOut: "990000",
      minAmountOut: "980000",
      deadline: "2030-01-01T00:00:00.000Z",
      source: "simulated_intents",
      simulated: true,
      confidentiality: "public",
    })),
  ),
  http.get(url("/v1/issuers"), () => answer(() => ({ items: db.issuers() }))),
  http.get(url("/v1/issuers/:id"), ({ params }) => answer(() => db.issuer(String(params.id)))),
  http.get(url("/v1/assets"), () =>
    answer(() => {
      const items = db.assets().map((summary) => {
        const convertible = db.compatibility(summary.id).some((r) => r.parityEnabled);
        return market.directoryItem(summary, db.asset(summary.id), convertible);
      });
      return { items, nextCursor: null, total: items.length };
    }),
  ),
  http.get(url("/v1/assets/:id"), ({ params }) => answer(() => db.asset(String(params.id)))),
  http.get(url("/v1/assets/:id/charts/price"), ({ params, request }) => {
    const query = new URL(request.url).searchParams;
    return answer(() =>
      market.priceChart(
        db.asset(String(params.id)),
        query.get("interval") ?? "1h",
        query.get("from"),
      ),
    );
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
