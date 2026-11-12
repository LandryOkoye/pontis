CREATE TABLE "custodians" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"jurisdiction" text,
	"attester_key" text NOT NULL,
	"status" text NOT NULL,
	"synthetic" boolean,
	"verification_status" text,
	"evidence" jsonb,
	"registered_by" text NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"needs_refresh" boolean DEFAULT true NOT NULL,
	"refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custody_links" (
	"representation_id" text PRIMARY KEY NOT NULL,
	"structure" text NOT NULL,
	"custodian_ids" jsonb NOT NULL,
	"linked_by" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_attestations" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"representation_id" text NOT NULL,
	"custodian_id" text NOT NULL,
	"reserved_units" numeric(39, 0) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"report_hash" text NOT NULL,
	"report_uri" text NOT NULL,
	"simulated" boolean NOT NULL,
	"source" text NOT NULL,
	"attester_key" text NOT NULL,
	"seq" bigint NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reserve_attestations_receipt_log_key" UNIQUE("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "reserve_monitor_report" (
	"name" text PRIMARY KEY NOT NULL,
	"report" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_policies" (
	"representation_id" text PRIMARY KEY NOT NULL,
	"tolerance_bps" integer NOT NULL,
	"max_reserve_age_ms" bigint NOT NULL,
	"action" text NOT NULL,
	"baseline_supply" numeric(39, 0) NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_status" (
	"representation_id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"action" text,
	"attested_units" numeric(39, 0) NOT NULL,
	"circulating_units" numeric(39, 0) NOT NULL,
	"ratio_bps" integer,
	"changed_at" timestamp with time zone NOT NULL,
	"chain_status" jsonb,
	"chain_refreshed_at" timestamp with time zone,
	"simulated" boolean DEFAULT true NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserve_supply_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"representation_id" text NOT NULL,
	"supply" numeric(39, 0) NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'chain_view' NOT NULL,
	CONSTRAINT "reserve_supply_reads_receipt_log_key" UNIQUE("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "signer_keys" (
	"role" text NOT NULL,
	"public_key" text NOT NULL,
	"account_id" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_by" text,
	"removed_at" timestamp with time zone,
	CONSTRAINT "signer_keys_role_public_key_pk" PRIMARY KEY("role","public_key")
);
--> statement-breakpoint
CREATE TABLE "issuer_reliability" (
	"issuer_id" text PRIMARY KEY NOT NULL,
	"requested" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"fulfilled" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"expired" integer DEFAULT 0 NOT NULL,
	"accept_misses" integer DEFAULT 0 NOT NULL,
	"fulfil_misses" integer DEFAULT 0 NOT NULL,
	"reclaimed" integer DEFAULT 0 NOT NULL,
	"accept_latency_ms_total" numeric(39, 0) DEFAULT '0' NOT NULL,
	"settle_latency_ms_total" numeric(39, 0) DEFAULT '0' NOT NULL,
	"last_miss_at" timestamp with time zone,
	"simulated" boolean DEFAULT true NOT NULL,
	"needs_refresh" boolean DEFAULT true NOT NULL,
	"refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mint_requests" (
	"id" bigint PRIMARY KEY NOT NULL,
	"representation_id" text NOT NULL,
	"recipient" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"reference" text NOT NULL,
	"status" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"failure" text
);
--> statement-breakpoint
CREATE TABLE "redemption_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"redemption_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"tx_hash" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "redemption_events_receipt_log_key" UNIQUE("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "redemption_terms" (
	"representation_id" text NOT NULL,
	"version" bigint NOT NULL,
	"terms_hash" text NOT NULL,
	"min_amount" numeric(39, 0) NOT NULL,
	"max_amount" numeric(39, 0) NOT NULL,
	"fee_bps" integer NOT NULL,
	"window_anchor_ms" bigint NOT NULL,
	"window_length_ms" bigint NOT NULL,
	"window_period_ms" bigint NOT NULL,
	"accept_within_ms" bigint NOT NULL,
	"settlement_days" integer NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	CONSTRAINT "redemption_terms_representation_id_version_pk" PRIMARY KEY("representation_id","version"),
	CONSTRAINT "redemption_terms_receipt_log_key" UNIQUE("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"user_account_id" text NOT NULL,
	"representation_id" text NOT NULL,
	"issuer_id" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"fee_bps" integer NOT NULL,
	"fee_units" numeric(39, 0) NOT NULL,
	"net_units" numeric(39, 0) NOT NULL,
	"terms_hash" text NOT NULL,
	"terms_version" bigint NOT NULL,
	"payout_instruction_hash" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"accept_deadline_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"fulfil_deadline_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"fulfilment_evidence_hash" text,
	"reject_reason" text,
	"miss" text
);
--> statement-breakpoint
CREATE INDEX "reserve_attestations_rep_seq_idx" ON "reserve_attestations" USING btree ("representation_id","seq");--> statement-breakpoint
CREATE INDEX "reserve_attestations_rep_custodian_idx" ON "reserve_attestations" USING btree ("representation_id","custodian_id","as_of");--> statement-breakpoint
CREATE INDEX "reserve_supply_reads_rep_idx" ON "reserve_supply_reads" USING btree ("representation_id","read_at");--> statement-breakpoint
CREATE INDEX "mint_requests_rep_idx" ON "mint_requests" USING btree ("representation_id","id");--> statement-breakpoint
CREATE INDEX "redemption_events_redemption_idx" ON "redemption_events" USING btree ("redemption_id","at");--> statement-breakpoint
CREATE INDEX "redemptions_user_idx" ON "redemptions" USING btree ("user_account_id","id");--> statement-breakpoint
CREATE INDEX "redemptions_rep_status_idx" ON "redemptions" USING btree ("representation_id","status");--> statement-breakpoint
CREATE INDEX "redemptions_status_deadlines_idx" ON "redemptions" USING btree ("status","accept_deadline_at","fulfil_deadline_at");