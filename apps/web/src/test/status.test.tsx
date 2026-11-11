import { screen, within } from "@testing-library/react";
import { buildQuote, transactionSettled } from "@pontis/api-types/fixtures";
import type { Transaction } from "@pontis/api-types";
import type { QuoteState } from "@pontis/domain";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { config } from "../lib/config.ts";
import { STATE } from "../lib/copy.ts";
import { DEMO_ACCOUNT } from "../mocks/db.ts";
import { buildTimeline } from "../pages/transaction.tsx";
import { renderApp } from "./render.tsx";
import { server } from "./server.ts";

const ID = transactionSettled.id;

function tx(state: QuoteState, extra: Partial<Transaction> = {}): Transaction {
  const sent = ["SUBMITTED", "SETTLED", "FAILED", "REQUIRES_RECONCILIATION"].includes(state);
  return {
    ...transactionSettled,
    quote: buildQuote(1_000_000n, state),
    state,
    txHash: sent ? transactionSettled.txHash : null,
    submittedAt: sent ? transactionSettled.submittedAt : null,
    settledAt: state === "SETTLED" ? transactionSettled.settledAt : null,
    events: state === "SETTLED" ? transactionSettled.events : [],
    ...extra,
  };
}

function serve(transaction: Transaction) {
  server.use(
    http.get(`${config.apiUrl}/v1/transactions/${ID}`, () => HttpResponse.json(transaction)),
  );
}

const STATES: QuoteState[] = [
  "QUOTED",
  "ACCEPTED",
  "SUBMITTED",
  "SETTLED",
  "EXPIRED",
  "REJECTED",
  "FAILED",
  "REQUIRES_RECONCILIATION",
];

describe("transaction status", () => {
  it.each(STATES)("renders the %s state with its label", async (state) => {
    serve(tx(state));
    renderApp(`/app/activity/${ID}`);
    expect(await screen.findByRole("heading", { name: "Parity conversion" })).toBeInTheDocument();
    expect(screen.getAllByText(STATE[state].label).length).toBeGreaterThan(0);
  });

  it("shows the receipt and the indexed event for a settled conversion", async () => {
    serve(tx("SETTLED"));
    renderApp(`/app/activity/${ID}`);
    expect(await screen.findByText("conversion_completed")).toBeInTheDocument();
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /9ZkBqE3n/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/txns/9ZkBqE3n"),
    );
  });

  it("says a failed conversion was refunded", async () => {
    serve(tx("FAILED", { failureReason: "The payout transfer failed." }));
    renderApp(`/app/activity/${ID}`);
    expect(
      await screen.findByText("This conversion failed. Your input was refunded in full."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("The payout transfer failed.").length).toBeGreaterThan(0);
  });

  it("reports an unknown conversion", async () => {
    renderApp("/app/activity/00000000-0000-4000-8000-000000000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This conversion could not be loaded",
    );
  });
});

describe("timeline", () => {
  it("ends on the final state and marks progress", () => {
    expect(buildTimeline(tx("SETTLED")).map((s) => s.status)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
    expect(buildTimeline(tx("SUBMITTED")).at(-1)).toMatchObject({
      title: "Awaiting settlement",
      status: "current",
    });
    expect(buildTimeline(tx("ACCEPTED"))[2]).toMatchObject({ status: "current" });
    expect(buildTimeline(tx("FAILED")).at(-1)).toMatchObject({
      title: "Failed and refunded",
      status: "error",
    });
    expect(buildTimeline(tx("REQUIRES_RECONCILIATION")).at(-1)).toMatchObject({ status: "warn" });
    expect(buildTimeline(tx("EXPIRED")).at(-1)).toMatchObject({
      title: "Expired",
      status: "muted",
    });
  });
});

describe("history", () => {
  it("lists the account's conversions across states and filters them", async () => {
    const { user } = renderApp("/app/activity", { account: DEMO_ACCOUNT });
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    for (const label of ["Expired", "Needs reconciliation"])
      expect(screen.getByText(label)).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Settled")).toHaveLength(3);
    await user.click(screen.getByRole("tab", { name: /Not completed/ }));
    expect(within(screen.getByRole("table")).queryByText("Settled")).not.toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("asks for a wallet before showing history", async () => {
    renderApp("/app/activity");
    expect(await screen.findByText("Connect a wallet to see its conversions")).toBeInTheDocument();
  });
});
