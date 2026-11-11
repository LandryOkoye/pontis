// Market data as returned by the API (ADR 0015). Prices and values are decimal strings at up to 8
// places, never floats. Every market figure says where it came from and whether it is simulated, so a
// UI cannot present a simulated number as real.

import {
  CANDLE_INTERVALS,
  DATA_FILTERS,
  DATA_SOURCES,
  VERIFICATION_STATUSES,
} from "@pontis/domain";
import { z } from "zod";
import { AmountString, RecordStatusSchema, Timestamp } from "./common.ts";
import { AssetSummarySchema } from "./registry-types.ts";

export const PriceString = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/)
  .meta({
    id: "PriceString",
    description:
      "Decimal with up to 8 fractional digits: a price or a value in the quote currency. Never a float.",
    example: "2681.42585338",
  });

export const DataSourceSchema = z.enum(DATA_SOURCES).meta({
  id: "DataSource",
  description:
    "`pontis_trades` is real testnet activity. `simulated_feed` is the labelled demo market.",
});
export const DataFilterSchema = z.enum(DATA_FILTERS).meta({
  id: "DataFilter",
  description:
    "`real` or `simulated` select one class. `all` uses a real row where one exists and a simulated one otherwise; every row still carries its own `simulated` flag.",
});
export const CandleIntervalSchema = z.enum(CANDLE_INTERVALS).meta({ id: "CandleInterval" });

/** Latest figures of one representation for one data class. */
export const MarketSnapshotSchema = z
  .object({
    price: PriceString,
    currency: z.string(),
    priceAsOf: Timestamp,
    change24hBps: z.number().int().nullable(),
    change7dBps: z.number().int().nullable(),
    change30dBps: z.number().int().nullable(),
    /** Smallest units; null when no supply snapshot exists, which is not the same as zero. */
    supply: AmountString.nullable(),
    marketCap: PriceString.nullable(),
    volume24h: PriceString,
    tvl: PriceString.nullable(),
    rank: z.number().int().positive().nullable(),
    sources: z.array(DataSourceSchema),
    simulated: z.boolean(),
  })
  .meta({ id: "MarketSnapshot" });

export const SparklineSchema = z
  .object({
    interval: CandleIntervalSchema,
    points: z.array(PriceString),
    simulated: z.boolean(),
  })
  .meta({ id: "Sparkline" });

/** A directory row: the registry summary plus market figures and filter facts. */
export const AssetDirectoryItemSchema = AssetSummarySchema.extend({
  category: z.string(),
  tags: z.array(z.string()),
  chains: z.array(z.string()),
  convertible: z.boolean(),
  bridgeable: z.boolean(),
  market: MarketSnapshotSchema.nullable(),
  sparkline: SparklineSchema.nullable(),
}).meta({ id: "AssetDirectoryItem" });

export const DIRECTORY_SORTS = [
  "id",
  "name",
  "price",
  "marketCap",
  "tvl",
  "volume24h",
  "change24h",
  "change7d",
  "change30d",
] as const;

const BoolParam = z.enum(["true", "false"]);

export const ListAssetsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().max(100).optional(),
  issuerId: z.string().max(64).optional(),
  chain: z.string().max(64).optional(),
  verification: z.enum(VERIFICATION_STATUSES).optional(),
  status: RecordStatusSchema.optional(),
  convertible: BoolParam.optional(),
  bridgeable: BoolParam.optional(),
  sort: z.enum(DIRECTORY_SORTS).default("id"),
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
  data: DataFilterSchema.default("all"),
});

export const AssetListSchema = z
  .object({
    items: z.array(AssetDirectoryItemSchema),
    /** Pass as `cursor` for the next page; null on the last page. Opaque. */
    nextCursor: z.string().nullable(),
    /** Matches before paging. */
    total: z.number().int().min(0),
  })
  .meta({ id: "AssetList" });

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
export type AssetDirectoryItem = z.infer<typeof AssetDirectoryItemSchema>;
export type ListAssetsQuery = z.infer<typeof ListAssetsQuerySchema>;
