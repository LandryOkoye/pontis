import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { config } from "../lib/config.ts";
import { DEMO_ACCOUNT, GUEST_ACCOUNT, db } from "../mocks/db.ts";
import { renderApp } from "./render.tsx";
import { server } from "./server.ts";

async function quote(amount: string, account = DEMO_ACCOUNT) {
  const app = renderApp("/app/convert?from=tgold-a&to=tgold-b", { account });
  const input = await screen.findByLabelText("You send");
  await app.user.type(input, amount);
  await app.user.click(await screen.findByRole("button", { name: "Get signed quote" }));
  return app;
}

describe("quote", () => {
  it("previews input, output, ratio, fee, route, warnings and a live expiry", async () => {
    await quote("1");
    const ticket = await screen.findByRole("region", { name: "Signed quote" });
    expect(within(ticket).getByText("1 TGOLD-A = 10 TGOLD-B")).toBeInTheDocument();
    expect(within(ticket).getByText("Protocol fee (0.10%)")).toBeInTheDocument();
    // 1 A -> 10 B gross, fee ceil(10 * 10 bps) = 0.01, net 9.99
    expect(within(ticket).getAllByTitle("9.99 TGOLD-B").length).toBeGreaterThan(0);
    expect(within(ticket).getByTitle("0.01 TGOLD-B")).toBeInTheDocument();
    expect(
      within(ticket).getByText("Controlled test vault · same chain · atomic"),
    ).toBeInTheDocument();
    expect(within(ticket).getByText(/Synthetic, unbacked test assets/)).toBeInTheDocument();
    expect(within(ticket).getByRole("timer")).toHaveAccessibleName(/Quote expires in \d+ seconds/);
  });

  it("offers a re-quote once the quote has expired", async () => {
    server.use(
      http.post(`${config.apiUrl}/v1/quotes`, async ({ request }) => {
        const body = (await request.json()) as {
          fromId: string;
          toId: string;
          amountIn: string;
          accountId: string;
        };
        const created = db.createQuote(body.fromId, body.toId, body.amountIn, body.accountId);
        return HttpResponse.json(
          { ...created, expiresAt: new Date(Date.now() - 1000).toISOString() },
          { status: 201 },
        );
      }),
    );
    await quote("1");
    expect(await screen.findByRole("timer")).toHaveAccessibleName("Quote expired");
    expect(screen.getByText("This quote has expired. No tokens moved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a new quote" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm and sign" })).not.toBeInTheDocument();
  });

  it("shows a distinct refusal for an account that is not allowlisted", async () => {
    await quote("1", GUEST_ACCOUNT);
    const refusal = await screen.findByRole("region", { name: "Quote refused" });
    expect(within(refusal).getByText(/NOT_ELIGIBLE/)).toBeInTheDocument();
    expect(
      within(refusal).getByRole("heading", { name: "This account is not on the allowlist" }),
    ).toBeInTheDocument();
  });

  it("shows a distinct refusal when the test vault is too low", async () => {
    server.use(
      http.post(`${config.apiUrl}/v1/quotes`, () =>
        HttpResponse.json(
          { code: "INSUFFICIENT_INVENTORY", message: "The vault holds too little." },
          { status: 422 },
        ),
      ),
    );
    await quote("1");
    expect(
      await screen.findByRole("heading", { name: "The test vault is too low" }),
    ).toBeInTheDocument();
  });

  it("does not offer a quote for a pair that is not a direct equivalent", async () => {
    renderApp("/app/convert?from=tgold-a&to=tgold-u", { account: DEMO_ACCOUNT });
    expect(await screen.findByText("No route")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /See why this pair cannot convert/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get signed quote" })).not.toBeInTheDocument();
  });

  it("rejects more decimal places than the token has", async () => {
    const { user } = renderApp("/app/convert?from=tgold-a&to=tgold-b", { account: DEMO_ACCOUNT });
    await user.type(await screen.findByLabelText("You send"), "0.1234567");
    expect(screen.getByText("At most 6 decimal places.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter an amount" })).toBeDisabled();
  });
});

describe("convert", () => {
  it("keeps the quote usable when the wallet request is rejected", async () => {
    const { user } = await quote("1");
    await user.click(await screen.findByRole("button", { name: "Confirm and sign" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve in wallet" });
    expect(within(dialog).getByText("ft_transfer_call")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Reject/ }));
    expect(
      await screen.findByText(/You declined the request in your wallet. Nothing was sent/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and sign" })).toBeEnabled();
  });

  it("signs the returned plan, reports the hash and follows the conversion to settlement", async () => {
    const { user, router } = await quote("1");
    await user.click(await screen.findByRole("button", { name: "Confirm and sign" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve in wallet" });
    // alice is not registered on TGOLD-B yet, so the plan registers her first.
    expect(within(dialog).getByText("storage_deposit")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Approve/ }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/activity\/.+/));
    expect(await screen.findByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Awaiting settlement")).toBeInTheDocument();
    expect(await screen.findByText("Received", {}, { timeout: 12_000 })).toBeInTheDocument();
    expect(screen.getAllByText("Settled").length).toBeGreaterThan(0);
    expect(screen.getByText("conversion_completed")).toBeInTheDocument();
    expect(db.view("tgold-b.pontis.testnet", "ft_balance_of", { account_id: DEMO_ACCOUNT })).toBe(
      "999000000",
    );
  });

  it("explains a quote that expired before it was signed", async () => {
    server.use(
      http.post(`${config.apiUrl}/v1/conversions`, () =>
        HttpResponse.json({ code: "QUOTE_EXPIRED", message: "expired" }, { status: 410 }),
      ),
    );
    const { user } = await quote("1");
    await user.click(await screen.findByRole("button", { name: "Confirm and sign" }));
    expect(
      await screen.findByText("The quote expired before it could be accepted. Get a new quote."),
    ).toBeInTheDocument();
  });
});
