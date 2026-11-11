import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./render.tsx";

describe("asset catalog", () => {
  it("lists representations with their claim, issuer and synthetic labels", async () => {
    renderApp("/app/assets");
    const row = (await screen.findByText("tgold-a.pontis.testnet")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Synthetic")).toBeInTheDocument();
    expect(within(row).getByText("Unverified")).toBeInTheDocument();
    expect(within(row).getByText("Synthetic Gold, one troy ounce")).toBeInTheDocument();
    expect(within(row).getByText("Synthetic Issuer A")).toBeInTheDocument();
    expect(within(row).getByText("1 / 1,000,000")).toBeInTheDocument();
    expect(screen.getByText("tgold-b.pontis.testnet")).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    const { user } = renderApp("/app/assets");
    await screen.findByText("tgold-a.pontis.testnet");
    await user.type(screen.getByRole("searchbox", { name: "Search assets" }), "silver");
    expect(screen.queryByText("tgold-a.pontis.testnet")).not.toBeInTheDocument();
    expect(screen.getByText("tsilv-a.pontis.testnet")).toBeInTheDocument();
  });
});

describe("asset detail", () => {
  it("shows claim, representation and issuer as separate sections", async () => {
    const { user } = renderApp("/app/assets/tgold-a");
    expect(await screen.findByRole("heading", { level: 1, name: "TGOLD-A" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "About" }));
    const claim = screen.getByRole("region", { name: "Canonical claim" });
    expect(
      within(claim).getByText("1 canonical unit = 1 fictional troy ounce"),
    ).toBeInTheDocument();
    expect(within(claim).getByText("Not backed by any asset.")).toBeInTheDocument();
    const token = screen.getByRole("region", { name: "Token representation" });
    expect(within(token).getByText("NEP-141")).toBeInTheDocument();
    expect(within(token).getByText("owner mint")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Issuer" })).getByText("Synthetic Issuer A"),
    ).toBeInTheDocument();
  });

  it("separates evidence by who produced it and shows empty tiers", async () => {
    const { user } = renderApp("/app/assets/tgold-a");
    await user.click(await screen.findByRole("tab", { name: "About" }));
    const issuerTier = await screen.findByRole("region", { name: "Issuer provided" });
    expect(within(issuerTier).getByText(/self-attested by the project/)).toBeInTheDocument();
    for (const tier of ["Third-party attested", "Independently verified"]) {
      expect(
        within(screen.getByRole("region", { name: tier })).getByText("None on record"),
      ).toBeInTheDocument();
    }
  });

  it("explains an unknown asset instead of crashing", async () => {
    renderApp("/app/assets/nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("NOT_FOUND");
  });
});

describe("compatibility explanation", () => {
  it("says why an approved direct equivalent converts", async () => {
    renderApp("/app/compare?from=tgold-a&to=tgold-b");
    expect(
      await screen.findByRole("heading", { name: /These convert at parity/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Direct equivalent").length).toBeGreaterThan(0);
    expect(screen.getByText(/ratio derived from unit multipliers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Convert TGOLD-A to TGOLD-B" })).toBeInTheDocument();
    // approval history, newest first
    const history = screen.getByRole("region", { name: "Review history" });
    expect(within(history).getByText("approved")).toBeInTheDocument();
    expect(within(history).getByText("proposed")).toBeInTheDocument();
  });

  it("says why a similar pair does not convert, even with a matching ratio", async () => {
    renderApp("/app/compare?from=tgold-a&to=tgold-u");
    expect(
      await screen.findByRole("heading", { name: "Not approved as direct equivalents" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A matching unit ratio alone never allows a parity conversion/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Convert TGOLD-A/ })).not.toBeInTheDocument();
  });
});
