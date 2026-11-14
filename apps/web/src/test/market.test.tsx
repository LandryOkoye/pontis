import { screen, within } from "@testing-library/react";
import type { AssetDirectoryItem, Compatibility, PriceChart } from "@pontis/api-types";
import { directoryItemA } from "@pontis/api-types/fixtures";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { config } from "../lib/config.ts";
import { chartQuery, toMarketChart, toMarketDetail, toMarketRow } from "../lib/market-adapter.ts";
import { usd, usdCompact } from "../lib/market-format.ts";
import { renderApp } from "./render.tsx";
import { server } from "./server.ts";

/** A directory row as the live API sends it: a simulated price, but no supply or market cap. */
const priced = {
  ...directoryItemA,
  id: "tacme-h",
  symbol: "TACME-H",
  name: "SYNTHETIC TEST Acme Share (Halcyon)",
  decimals: 6,
  unitMultiplier: { num: "1", den: "1000000" },
  market: {
    price: "168.07780726",
    currency: "USD",
    priceAsOf: "2026-11-13T09:10:00.000Z",
    change24hBps: -31,
    change7dBps: null,
    change30dBps: null,
    supply: null,
    marketCap: null,
    volume24h: "0",
    tvl: "1250.5",
    rank: null,
    sources: ["simulated_feed"],
    simulated: true,
  },
  sparkline: { interval: "4h", points: ["167.82107844", "168.07780726"], simulated: true },
} satisfies AssetDirectoryItem;
const unpriced: AssetDirectoryItem = {
  ...priced,
  id: "tacme-m",
  symbol: "TACME-M",
  market: null,
  sparkline: null,
};

describe("market adapter", () => {
  it("maps a directory row and keeps missing figures null", () => {
    expect(toMarketRow(priced)).toMatchObject({
      priceUsd: 168.07780726,
      change24h: -0.0031,
      change7d: null,
      marketCapUsd: null,
      circulatingSupply: null,
      volume24hUsd: 0,
      tvlUsd: 1250.5,
      sparkline: [167.82107844, 168.07780726],
      simulated: true,
    });
    expect(toMarketRow(unpriced)).toMatchObject({ priceUsd: null, sparkline: [] });
    expect(usd(null)).toBe("—");
    expect(usdCompact(undefined)).toBe("—");
  });

  it("builds an asset's pairs from its recorded relations", () => {
    const relations = [
      { counterpartId: "tacme-m", parityEnabled: true },
      { counterpartId: "not-listed", parityEnabled: false },
    ] as Compatibility[];
    const detail = toMarketDetail([priced, unpriced], "tacme-h", relations);
    expect(detail?.asset.canonicalUnitsPerToken).toBe(1);
    expect(detail?.pairs).toEqual([
      { pair: "TACME-H / TACME-M", kind: "Parity route", priceUsd: 168.07780726, depthUsd: 1250.5 },
    ]);
    expect(toMarketDetail([priced], "nope", [])).toBeUndefined();
  });

  it("asks for candles sized to the range and reads their closes", () => {
    const now = Date.parse("2026-11-14T12:00:00.000Z");
    expect(chartQuery("24h", now)).toBe("interval=15m&from=2026-11-13T12%3A00%3A00.000Z");
    expect(chartQuery("All", now)).toBe("interval=1d");
    const chart = {
      points: [{ t: "2026-11-14T11:00:00.000Z", close: "2.5", volumeQuote: "10.25" }],
    } as PriceChart;
    expect(toMarketChart("1W", chart).points).toEqual([
      { t: Date.parse("2026-11-14T11:00:00.000Z"), price: 2.5, volume: 10.25 },
    ]);
  });
});

/** The Markets page has several tables; this is the asset list. */
async function marketsTable(): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: "Tokenized assets" });
  const panel = heading.closest("section") as HTMLElement;
  return within(panel).findByRole("table");
}

describe("markets screen", () => {
  it("shows simulated prices from the asset directory", async () => {
    renderApp("/app");
    const table = await marketsTable();
    expect((await within(table).findAllByText(/^\$[\d,]+\.\d\d$/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Market data is not available")).not.toBeInTheDocument();
  });

  it("lists unpriced assets with dashes instead of failing", async () => {
    server.use(
      http.get(`${config.apiUrl}/v1/assets`, () =>
        HttpResponse.json({ items: [priced, unpriced], nextCursor: null, total: 2 }),
      ),
    );
    renderApp("/app");
    const table = await marketsTable();
    const row = (await within(table).findByText("TACME-M")).closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(within(table).getByText("$168.08")).toBeInTheDocument();
  });

  it("follows the directory's cursor to load every page", async () => {
    let calls = 0;
    server.use(
      http.get(`${config.apiUrl}/v1/assets`, ({ request }) => {
        calls += 1;
        const second = new URL(request.url).searchParams.get("cursor") === "next";
        return HttpResponse.json({
          items: [second ? unpriced : priced],
          nextCursor: second ? null : "next",
          total: 2,
        });
      }),
    );
    renderApp("/app");
    const table = await marketsTable();
    expect(await within(table).findByText("TACME-M")).toBeInTheDocument();
    expect(within(table).getByText("TACME-H")).toBeInTheDocument();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
