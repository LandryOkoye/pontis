CREATE TABLE "asset_market_stats" (
	"representation_id" text NOT NULL,
	"simulated" boolean NOT NULL,
	"currency" text NOT NULL,
	"price" numeric(48, 8) NOT NULL,
	"price_as_of" timestamp with time zone NOT NULL,
	"change24h_bps" integer,
	"change7d_bps" integer,
	"change30d_bps" integer,
	"supply" numeric(39, 0),
	"market_cap" numeric(48, 8),
	"volume_24h" numeric(48, 8) DEFAULT '0' NOT NULL,
	"tvl" numeric(48, 8),
	"rank" integer,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_market_stats_representation_id_simulated_pk" PRIMARY KEY("representation_id","simulated")
);
--> statement-breakpoint
CREATE TABLE "asset_profiles" (
	"representation_id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"convertible" boolean DEFAULT true NOT NULL,
	"bridgeable" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"simulated" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_search" (
	"representation_id" text PRIMARY KEY NOT NULL,
	"document" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"representation_id" text NOT NULL,
	"interval" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"simulated" boolean NOT NULL,
	"open" numeric(48, 8) NOT NULL,
	"high" numeric(48, 8) NOT NULL,
	"low" numeric(48, 8) NOT NULL,
	"close" numeric(48, 8) NOT NULL,
	"volume_base" numeric(39, 0) DEFAULT '0' NOT NULL,
	"volume_quote" numeric(48, 8) DEFAULT '0' NOT NULL,
	"trades" integer DEFAULT 0 NOT NULL,
	"filled" boolean DEFAULT false NOT NULL,
	"source_mix" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "candles_representation_id_interval_bucket_start_simulated_pk" PRIMARY KEY("representation_id","interval","bucket_start","simulated")
);
--> statement-breakpoint
CREATE TABLE "nav_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"representation_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"nav" numeric(48, 8) NOT NULL,
	"currency" text NOT NULL,
	"source" text NOT NULL,
	"simulated" boolean NOT NULL,
	CONSTRAINT "nav_points_rep_ts_source_key" UNIQUE("representation_id","ts","source")
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"representation_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"price" numeric(48, 8) NOT NULL,
	"currency" text NOT NULL,
	"source" text NOT NULL,
	"simulated" boolean NOT NULL,
	"attestation" jsonb,
	CONSTRAINT "price_points_rep_ts_source_key" UNIQUE("representation_id","ts","source")
);
--> statement-breakpoint
CREATE TABLE "supply_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"representation_id" text NOT NULL,
	"chain" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"supply" numeric(39, 0) NOT NULL,
	"source" text NOT NULL,
	"simulated" boolean NOT NULL,
	CONSTRAINT "supply_snapshots_rep_chain_ts_key" UNIQUE("representation_id","chain","ts")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"kind" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"account_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"amount_in" numeric(39, 0) NOT NULL,
	"amount_out" numeric(39, 0) NOT NULL,
	"fee" numeric(39, 0) NOT NULL,
	"source" text NOT NULL,
	"simulated" boolean NOT NULL,
	"event_id" bigint,
	CONSTRAINT "trades_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE INDEX "asset_market_stats_rank_idx" ON "asset_market_stats" USING btree ("simulated","rank");--> statement-breakpoint
CREATE INDEX "price_points_rep_ts_idx" ON "price_points" USING btree ("representation_id","ts");--> statement-breakpoint
CREATE INDEX "trades_ts_idx" ON "trades" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "trades_from_ts_idx" ON "trades" USING btree ("from_id","ts");
--> statement-breakpoint
-- Hand-written (drizzle-kit does not model extensions or operator classes): trigram search over asset_search.document (ADR 0015).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "asset_search_document_trgm_idx" ON "asset_search" USING gin ("document" gin_trgm_ops);
