import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MOCK_EVM_STORAGE_KEY } from "../evm/mock-wallet.tsx";
import { config } from "../lib/config.ts";
import { healthText, projectDebt, wadPercent } from "../lib/lending.ts";
import { DEMO_EVM_ACCOUNT } from "../mocks/lending.ts";
import { renderApp } from "./render.tsx";
import { server } from "./server.ts";

const MARKET = "/app/borrow/nvda-usdc-sepolia";

function open(path: string, connected = true) {
  if (connected) localStorage.setItem(MOCK_EVM_STORAGE_KEY, DEMO_EVM_ACCOUNT);
  return renderApp(path);
}

type App = ReturnType<typeof renderApp>;

/** Types an amount, reviews the plan and approves each call in the simulated wallet. */
async function act(app: App, tab: string, amount: string, calls: number) {
  const panel = await screen.findByRole("region", { name: "Manage position" });
  await app.user.click(within(panel).getByRole("tab", { name: tab }));
  await app.user.type(within(panel).getByRole("textbox"), amount);
  await app.user.click(
    await within(panel).findByRole("button", { name: `Review ${tab.toLowerCase()}` }),
  );
  expect(await within(panel).findAllByRole("listitem")).toHaveLength(calls);
  await app.user.click(within(panel).getByRole("button", { name: "Sign in wallet" }));
  for (let i = 0; i < calls; i += 1)
    await app.user.click(await screen.findByRole("button", { name: "Approve" }));
  await within(panel).findByText("All calls confirmed");
  await app.user.click(within(panel).getByRole("button", { name: "Done" }));
  return panel;
}

describe("lending math", () => {
  it("formats WAD ratios and previews a debt change with integer math", () => {
    expect(wadPercent("625000000000000000")).toBe("62.50%");
    expect(healthText("1789000000000000000")).toBe("1.78");
    const capacity = {
      collateralValue: "280000000",
      maximumBorrowCapacity: "140000000",
      availableBorrowAmount: "140000000",
      outstandingDebt: "0",
      currentLtvWad: "0",
      liquidationThresholdWad: "625000000000000000",
      healthFactorWad: null,
      marketLiquidity: "50000000000",
    };
    const after = projectDebt(capacity, 100_000_000n);
    expect(wadPercent(after.ltvWad)).toBe("35.71%");
    expect(healthText(after.healthFactorWad as bigint)).toBe("1.75");
    expect(projectDebt(capacity, -5n)).toMatchObject({ debt: 0n, healthFactorWad: null });
  });
});

describe("borrow overview", () => {
  it("lists markets with eligibility and the collateral registry without a wallet", async () => {
    open("/app/borrow", false);
    const markets = await screen.findByRole("region", { name: "Lending markets" });
    expect(await within(markets).findByText("NVDA / USDC")).toBeInTheDocument();
    expect(await within(markets).findByText("62.50%")).toBeInTheDocument();
    expect(await within(markets).findByText("Stale price")).toBeInTheDocument();
    expect(await within(markets).findAllByText("Eligible")).toHaveLength(3);
    expect(within(markets).queryByText("Your debt")).not.toBeInTheDocument();

    const registry = await screen.findByRole("region", { name: "Collateral registry" });
    expect(await within(registry).findByText("Token not verified")).toBeInTheDocument();
    expect(within(registry).getByText("Discovered on Rhea")).toBeInTheDocument();
    expect(screen.getByText("No Sepolia wallet connected")).toBeInTheDocument();
  });

  it("shows the connected wallet's eligible collateral and positions", async () => {
    const app = open("/app/borrow", false);
    await app.user.click(await screen.findByRole("button", { name: "Connect Sepolia wallet" }));
    const holdings = await screen.findByRole("region", {
      name: "Eligible collateral in your wallet",
    });
    expect(await within(holdings).findAllByText("NVDA")).not.toHaveLength(0);
    expect(
      within(await screen.findByRole("region", { name: "Lending markets" })).getByText(
        "You can borrow",
      ),
    ).toBeInTheDocument();
  });

  it("says so when the API does not serve lending", async () => {
    server.use(
      http.get(`${config.apiUrl}/v1/lending/markets`, () =>
        HttpResponse.json({ code: "NOT_FOUND", message: "Route not found" }, { status: 404 }),
      ),
    );
    open("/app/borrow", false);
    expect(await screen.findByText("Lending is not enabled on this API")).toBeInTheDocument();
  });
});

describe("market", () => {
  it("deposits, borrows, repays and withdraws through wallet-signed plans", async () => {
    const app = open(MARKET);
    const position = await screen.findByRole("region", { name: "Your position" });
    await within(position).findByText("No debt");

    // 2 NVDA at 140 USDC, Pontis policy LTV 50% -> 140 USDC of capacity.
    await act(app, "Deposit", "2", 2);
    await waitFor(() =>
      expect(within(position).getAllByTitle("140 USDC").length).toBeGreaterThan(0),
    );
    expect(within(position).getByTitle("280 USDC")).toBeInTheDocument();
    expect(within(position).getByText(/Pontis borrow limit/)).toHaveTextContent("50.00%");

    const panel = await act(app, "Borrow", "100", 1);
    await waitFor(() => expect(within(position).getByText("1.75")).toBeInTheDocument());
    expect(within(position).getByTitle("100 USDC")).toBeInTheDocument();
    expect(within(position).getByText("35.71%")).toBeInTheDocument();

    await act(app, "Repay", "100", 2);
    await within(position).findByText("No debt");

    await act(app, "Withdraw", "2", 1);
    await waitFor(() => expect(within(position).getAllByTitle("0 USDC").length).toBeGreaterThan(2));
    await app.user.click(within(panel).getByRole("tab", { name: "Deposit" }));
    expect(await within(panel).findByText("12")).toBeInTheDocument();
  });

  it("previews the position and blocks a borrow above capacity", async () => {
    const app = open(MARKET);
    await act(app, "Deposit", "2", 2);
    const panel = screen.getByRole("region", { name: "Manage position" });
    await app.user.click(within(panel).getByRole("tab", { name: "Borrow" }));
    const input = within(panel).getByRole("textbox");
    await app.user.type(input, "70");
    const preview = await within(panel).findByLabelText("After this action");
    expect(within(preview).getByText("2.5")).toBeInTheDocument();
    await app.user.clear(input);
    await app.user.type(input, "141");
    expect(within(panel).getByText("More than you can borrow right now.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Review borrow" })).toBeDisabled();
  });

  it("sends nothing when the wallet request is declined", async () => {
    const app = open(MARKET);
    const panel = await screen.findByRole("region", { name: "Manage position" });
    await app.user.type(within(panel).getByRole("textbox"), "1");
    await app.user.click(await within(panel).findByRole("button", { name: "Review deposit" }));
    await app.user.click(await within(panel).findByRole("button", { name: "Sign in wallet" }));
    await app.user.click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Request declined")).toBeInTheDocument();
    expect(within(panel).getAllByText("Not sent")).toHaveLength(2);
  });

  it("surfaces a refusal from the API", async () => {
    server.use(
      http.post(`${config.apiUrl}/v1/lending/deposits`, () =>
        HttpResponse.json({ code: "NOT_ELIGIBLE", message: "STALE_PRICE" }, { status: 422 }),
      ),
    );
    const app = open(MARKET);
    const panel = await screen.findByRole("region", { name: "Manage position" });
    await app.user.type(within(panel).getByRole("textbox"), "1");
    await app.user.click(await within(panel).findByRole("button", { name: "Review deposit" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "The collateral is not eligible: STALE_PRICE.",
    );
  });

  it("explains an ineligible market and keeps deposits and borrows closed", async () => {
    const app = open("/app/borrow/tsla-usdt-sepolia");
    const verdict = await screen.findByRole("region", { name: "Collateral eligibility" });
    expect(await within(verdict).findByText("Stale price.")).toBeInTheDocument();
    expect(
      await screen.findByText("Capacity is not quoted for ineligible collateral"),
    ).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Manage position" });
    expect(within(panel).getByRole("textbox")).toBeDisabled();
    await app.user.click(within(panel).getByRole("tab", { name: "Withdraw" }));
    expect(within(panel).getByRole("textbox")).toBeEnabled();
  });

  it("answers an unknown market id", async () => {
    open("/app/borrow/nope");
    expect(await screen.findByText("Market not found")).toBeInTheDocument();
  });
});
