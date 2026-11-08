CREATE TABLE "asset_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"uri" text NOT NULL,
	"sha256" text NOT NULL,
	"provenance" text NOT NULL,
	"description" text NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_representations" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_asset_id" text NOT NULL,
	"issuer_id" text NOT NULL,
	"account_id" text NOT NULL,
	"standard" text DEFAULT 'NEP-141' NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"decimals" integer NOT NULL,
	"unit_multiplier_num" numeric(39, 0) NOT NULL,
	"unit_multiplier_den" numeric(39, 0) NOT NULL,
	"admin_capabilities" jsonb NOT NULL,
	"custody_description" text NOT NULL,
	"redemption_mechanism" text NOT NULL,
	"transfer_policy_summary" text NOT NULL,
	"bridge_status" text NOT NULL,
	"allowlist_required" boolean NOT NULL,
	"vault_inventory" numeric(39, 0) NOT NULL,
	"registered_by" text NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"synthetic" boolean NOT NULL,
	"verification_status" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"claim_description" text NOT NULL,
	"unit_definition" text NOT NULL,
	"denomination" text,
	"economic_rights" text NOT NULL,
	"legal_claim_structure" text NOT NULL,
	"jurisdiction" text,
	"redemption_terms" text NOT NULL,
	"valuation_method" text,
	"eligibility_restrictions" text NOT NULL,
	"risk_disclosures" jsonb NOT NULL,
	"registered_by" text NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"synthetic" boolean NOT NULL,
	"verification_status" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compatibility_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"representation_a_id" text NOT NULL,
	"representation_b_id" text NOT NULL,
	"classification" text NOT NULL,
	"ratio_num" numeric(39, 0) NOT NULL,
	"ratio_den" numeric(39, 0) NOT NULL,
	"scope" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text NOT NULL,
	"version" bigint NOT NULL,
	"proposed_by" text NOT NULL,
	"approved_by" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compatibility_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"relationship_id" text NOT NULL,
	"version" bigint NOT NULL,
	"action" text NOT NULL,
	"classification" text NOT NULL,
	"status" text NOT NULL,
	"ratio_num" numeric(39, 0) NOT NULL,
	"ratio_den" numeric(39, 0) NOT NULL,
	"scope" text NOT NULL,
	"rationale" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issuers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text,
	"authorized_categories" jsonb NOT NULL,
	"controlled_accounts" jsonb NOT NULL,
	"contact" text,
	"registered_by" text NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"synthetic" boolean NOT NULL,
	"verification_status" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer_policies" (
	"representation_id" text PRIMARY KEY NOT NULL,
	"allowlist_required" boolean NOT NULL,
	"policy_version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"detail" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"tx_hash" text,
	"failure_reason" text,
	"submitted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversions_quoteId_unique" UNIQUE("quote_id"),
	CONSTRAINT "conversions_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "indexer_cursor" (
	"name" text PRIMARY KEY NOT NULL,
	"block_height" bigint NOT NULL,
	"block_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"amount_in" numeric(39, 0) NOT NULL,
	"amount_out_gross" numeric(39, 0) NOT NULL,
	"fee" numeric(39, 0) NOT NULL,
	"amount_out" numeric(39, 0) NOT NULL,
	"ratio_num" numeric(39, 0) NOT NULL,
	"ratio_den" numeric(39, 0) NOT NULL,
	"fee_bps" integer NOT NULL,
	"nonce" text NOT NULL,
	"signature" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"compatibility_version" bigint NOT NULL,
	"policy_version" bigint NOT NULL,
	"route" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE "settlement_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"event_name" text NOT NULL,
	"data" jsonb NOT NULL,
	"conversion_id" uuid,
	CONSTRAINT "settlement_events_receipt_log_key" UNIQUE("receipt_id","log_index")
);
--> statement-breakpoint
ALTER TABLE "asset_representations" ADD CONSTRAINT "asset_representations_canonical_asset_id_canonical_assets_id_fk" FOREIGN KEY ("canonical_asset_id") REFERENCES "public"."canonical_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_representations" ADD CONSTRAINT "asset_representations_issuer_id_issuers_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_relationships" ADD CONSTRAINT "compatibility_relationships_representation_a_id_asset_representations_id_fk" FOREIGN KEY ("representation_a_id") REFERENCES "public"."asset_representations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_relationships" ADD CONSTRAINT "compatibility_relationships_representation_b_id_asset_representations_id_fk" FOREIGN KEY ("representation_b_id") REFERENCES "public"."asset_representations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_reviews" ADD CONSTRAINT "compatibility_reviews_relationship_id_compatibility_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."compatibility_relationships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_policies" ADD CONSTRAINT "transfer_policies_representation_id_asset_representations_id_fk" FOREIGN KEY ("representation_id") REFERENCES "public"."asset_representations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_from_id_asset_representations_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."asset_representations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_to_id_asset_representations_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."asset_representations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_conversion_id_conversions_id_fk" FOREIGN KEY ("conversion_id") REFERENCES "public"."conversions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_evidence_subject_idx" ON "asset_evidence" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_representations_account_id_key" ON "asset_representations" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compatibility_reviews_relationship_version_key" ON "compatibility_reviews" USING btree ("relationship_id","version");--> statement-breakpoint
CREATE INDEX "quotes_account_idx" ON "quotes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "quotes_state_expiry_idx" ON "quotes" USING btree ("state","expires_at");