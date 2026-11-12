// Market overview reads (ADR 0015): the dashboard's global stats, movers, and the category and
// chain breakdowns. Same honesty rule as every market figure: `simulated` and `sources` say what
// the numbers are made of, and `data` says which class was asked for.

import { z } from "zod";
import { AmountString, Timestamp } from "./common.ts";
import { DataFilterSchema, DataSourceSchema, PriceString } from "./market-types.ts";

const figures = {
  simulated: z.boolean(),
  sources: z.array(DataSourceSchema),
};

export const OverviewQuerySchema = z.object({ data: DataFilterSchema.default("all") });

export const MarketOverviewSchema = z
  .object({
    data: DataFilterSchema,
    asOf: Timestamp,
    assetCount: z.number().int().min(0),
    pricedAssetCount: z.number().int().min(0),
    issuerCount: z.number().int().min(0),
    chainCount: z.number().int().min(0),
    convertibleAssetCount: z.number().int().min(0),
    totalMarketCap: PriceString.nullable(),
    totalTvl: PriceString.nullable(),
    volume24h: PriceString,
    change24hBps: z.number().int().nullable(),
    ...figures,
  })
  .meta({ id: "MarketOverview" });

export const MoverSchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    name: z.string(),
    price: PriceString,
    change24hBps: z.number().int().nullable(),
    marketCap: PriceString.nullable(),
    volume24h: PriceString,
    tvl: PriceString.nullable(),
    simulated: z.boolean(),
  })
  .meta({ id: "Mover" });

export const MoversQuerySchema = z.object({
  data: DataFilterSchema.default("all"),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const MarketMoversSchema = z
  .object({
    data: DataFilterSchema,
    gainers: z.array(MoverSchema),
    losers: z.array(MoverSchema),
    topByVolume: z.array(MoverSchema),
    topByTvl: z.array(MoverSchema),
    newlyListed: z.array(
      z.object({
        id: z.string(),
        symbol: z.string(),
        name: z.string(),
        registeredAt: Timestamp,
        market: MoverSchema.nullable(),
      }),
    ),
  })
  .meta({ id: "MarketMovers" });

export const CategoryBreakdownSchema = z
  .object({
    category: z.string(),
    assetCount: z.number().int().min(0),
    marketCap: PriceString.nullable(),
    volume24h: PriceString,
    tvl: PriceString.nullable(),
    ...figures,
  })
  .meta({ id: "CategoryBreakdown" });

export const ChainBreakdownSchema = z
  .object({
    chain: z.string(),
    assetCount: z.number().int().min(0),
    value: PriceString.nullable(),
    supplies: z.array(z.object({ id: z.string(), supply: AmountString })),
    ...figures,
  })
  .meta({ id: "ChainBreakdown" });

export const CategoryListSchema = z
  .object({ data: DataFilterSchema, items: z.array(CategoryBreakdownSchema) })
  .meta({ id: "CategoryList" });
export const ChainListSchema = z
  .object({ data: DataFilterSchema, items: z.array(ChainBreakdownSchema) })
  .meta({ id: "ChainList" });

export type MarketOverview = z.infer<typeof MarketOverviewSchema>;
export type MarketMovers = z.infer<typeof MarketMoversSchema>;
export type Mover = z.infer<typeof MoverSchema>;
export type CategoryList = z.infer<typeof CategoryListSchema>;
export type ChainList = z.infer<typeof ChainListSchema>;
