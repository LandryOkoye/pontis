// MSW handlers for the lending endpoints, backed by the in-memory lending venue.
import { HttpResponse, delay, http } from "msw";
import { config } from "../lib/config.ts";
import type { EligibilityRequest, LendingOperation, PlanRequest } from "../lib/lending-types.ts";
import { LendingMockError, lendingDb } from "./lending.ts";

const url = (path: string) => `${config.apiUrl}${path}`;
const LATENCY_MS = import.meta.env.MODE === "test" ? 0 : 260;

async function answer(run: () => unknown): Promise<Response> {
  await delay(LATENCY_MS);
  try {
    return HttpResponse.json(run() as Record<string, unknown>);
  } catch (error) {
    if (error instanceof LendingMockError)
      return HttpResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    return HttpResponse.json(
      { code: "INTERNAL", message: "Mock handler failed." },
      { status: 500 },
    );
  }
}

const owner = (request: Request) => new URL(request.url).searchParams.get("owner") ?? "";

const PLANS: [string, LendingOperation][] = [
  ["/v1/lending/deposits", "deposit"],
  ["/v1/lending/borrows", "borrow"],
  ["/v1/lending/repayments", "repay"],
  ["/v1/lending/withdrawals", "withdraw"],
];

export const lendingHandlers = [
  http.get(url("/v1/lending/collateral-assets"), () =>
    answer(() => ({ items: lendingDb.assets() })),
  ),
  http.get(url("/v1/lending/wallet-assets"), ({ request }) =>
    answer(() => ({ items: lendingDb.walletAssets(owner(request)) })),
  ),
  http.get(url("/v1/lending/markets"), () => answer(() => ({ items: lendingDb.markets() }))),
  http.post(url("/v1/lending/eligibility"), async ({ request }) => {
    const body = (await request.json()) as EligibilityRequest;
    return answer(() => lendingDb.eligibility(body));
  }),
  http.get(url("/v1/lending/markets/:id/capacity"), ({ params, request }) =>
    answer(() => lendingDb.capacity(String(params.id), owner(request))),
  ),
  ...PLANS.map(([path, operation]) =>
    http.post(url(path), async ({ request }) => {
      const body = (await request.json()) as PlanRequest;
      return answer(() => lendingDb.plan(operation, body));
    }),
  ),
];
