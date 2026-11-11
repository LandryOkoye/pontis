// Market data (ADR 0015). Keys are plain text IDs with no foreign key to the registry mirror,
// because the registry sync replaces the mirror from the chain. Every row says where it came from
// (`source`) and whether it is a simulation (`simulated`); aggregates never mix the two.

import type { CandleInterval, DataSource } from "@pontis/domain";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const u128 = (name: string) => numeric(name, { precision: 39, scale: 0 });
/** A price or value at 8 decimals; read back as a string, never a float. */
const price = (name: string) => numeric(name, { precision: 48, scale: 8 });

/** A price signed by a price publisher; verified on chain from phase 2 (ADR 0015 section 5). */
export interface StoredAttestation {
  domain: string;
  publisherKey: string;
  signature: string;
}

/** Off-chain dossier of a representation. Never marks anything verified (ADR 0009). */
export const assetProfiles = pgTable("asset_profiles", {
  representationId: text().primaryKey(),
  description: text().notNull(),
  tags: jsonb()
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Where the asset exists: `{chain, contract, role}` per chain. */
  chains: jsonb()
    .$type<{ chain: string; contract: string | null; role: string }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  documents: jsonb()
    .$type<{ title: string; uri: string; sha256: string | null }[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Free-form dossier sections (overview, legal, custody, risk) keyed by tab. */
  sections: jsonb()
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  /** Transfer-restriction hints for the directory filters; the contract is the authority. */
  convertible: boolean().notNull().default(true),
  bridgeable: boolean().notNull().default(false),
  source: text().$type<DataSource>().notNull(),
  simulated: boolean().notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});

export const pricePoints = pgTable(
  "price_points",
  {
    id: serial().primaryKey(),
    representationId: text().notNull(),
    ts: at("ts").notNull(),
    price: price("price").notNull(),
    currency: text().notNull(),
    source: text().$type<DataSource>().notNull(),
    simulated: boolean().notNull(),
    attestation: jsonb().$type<StoredAttestation>(),
  },
  (t) => [
    unique("price_points_rep_ts_source_key").on(t.representationId, t.ts, t.source),
    index("price_points_rep_ts_idx").on(t.representationId, t.ts),
  ],
);

export const candles = pgTable(
  "candles",
  {
    representationId: text().notNull(),
    interval: text().$type<CandleInterval>().notNull(),
    bucketStart: at("bucket_start").notNull(),
    simulated: boolean().notNull(),
    open: price("open").notNull(),
    high: price("high").notNull(),
    low: price("low").notNull(),
    close: price("close").notNull(),
    /** Smallest units of the representation that traded in the bucket. */
    volumeBase: u128("volume_base").notNull().default("0"),
    /** Base volume valued at the bucket's close price. */
    volumeQuote: price("volume_quote").notNull().default("0"),
    trades: integer().notNull().default(0),
    /** True when no price point fell in the bucket and the previous close was carried forward. */
    filled: boolean().notNull().default(false),
    sourceMix: jsonb()
      .$type<DataSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.representationId, t.interval, t.bucketStart, t.simulated] })],
);

export const navPoints = pgTable(
  "nav_points",
  {
    id: serial().primaryKey(),
    representationId: text().notNull(),
    ts: at("ts").notNull(),
    nav: price("nav").notNull(),
    currency: text().notNull(),
    source: text().$type<DataSource>().notNull(),
    simulated: boolean().notNull(),
  },
  (t) => [unique("nav_points_rep_ts_source_key").on(t.representationId, t.ts, t.source)],
);

export const supplySnapshots = pgTable(
  "supply_snapshots",
  {
    id: serial().primaryKey(),
    representationId: text().notNull(),
    chain: text().notNull(),
    ts: at("ts").notNull(),
    supply: u128("supply").notNull(),
    source: text().$type<DataSource>().notNull(),
    simulated: boolean().notNull(),
  },
  (t) => [unique("supply_snapshots_rep_chain_ts_key").on(t.representationId, t.chain, t.ts)],
);

/** Settled conversions normalised for charts and activity. `ref` makes every insert idempotent. */
export const trades = pgTable(
  "trades",
  {
    id: serial().primaryKey(),
    /** `event:<settlement_events.id>` for real trades; a stable label for simulated ones. */
    ref: text().notNull().unique(),
    kind: text().notNull(),
    ts: at("ts").notNull(),
    accountId: text().notNull(),
    fromId: text().notNull(),
    toId: text().notNull(),
    amountIn: u128("amount_in").notNull(),
    amountOut: u128("amount_out").notNull(),
    fee: u128("fee").notNull(),
    source: text().$type<DataSource>().notNull(),
    simulated: boolean().notNull(),
    /** Last settlement event folded into `trades`, for real trades; lets the sync resume. */
    eventId: bigint({ mode: "number" }),
  },
  (t) => [index("trades_ts_idx").on(t.ts), index("trades_from_ts_idx").on(t.fromId, t.ts)],
);

/** Latest figures per representation and data class, refreshed by the stats job. */
export const assetMarketStats = pgTable(
  "asset_market_stats",
  {
    representationId: text().notNull(),
    simulated: boolean().notNull(),
    currency: text().notNull(),
    price: price("price").notNull(),
    priceAsOf: at("price_as_of").notNull(),
    change24hBps: integer(),
    change7dBps: integer(),
    change30dBps: integer(),
    /** Null when no supply snapshot exists, which is not the same as zero. */
    supply: u128("supply"),
    marketCap: price("market_cap"),
    volume24h: price("volume_24h").notNull().default("0"),
    tvl: price("tvl"),
    rank: integer(),
    sources: jsonb()
      .$type<DataSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    refreshedAt: at("refreshed_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.representationId, t.simulated] }),
    index("asset_market_stats_rank_idx").on(t.simulated, t.rank),
  ],
);

/** Lower-cased searchable text per representation, indexed for trigram search (migration). */
export const assetSearch = pgTable("asset_search", {
  representationId: text().primaryKey(),
  document: text().notNull(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
