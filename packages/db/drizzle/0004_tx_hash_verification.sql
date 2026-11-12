ALTER TABLE "conversions" ADD COLUMN "reported_tx_hash" text;--> statement-breakpoint
ALTER TABLE "conversions" ADD COLUMN "tx_hash_status" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversions" ADD COLUMN "tx_hash_checked_at" timestamp with time zone;
--> statement-breakpoint
-- Every stored hash so far was only ever what the wallet reported. Keep it as reported, and clear
-- the verified columns: nothing in them was checked against the chain. The indexer verifies
-- REPORTED hashes of settled conversions again and fills them in.
UPDATE "conversions" SET "reported_tx_hash" = "tx_hash", "tx_hash_status" = 'REPORTED' WHERE "tx_hash" IS NOT NULL;
--> statement-breakpoint
UPDATE "conversions" SET "tx_hash" = NULL;
--> statement-breakpoint
UPDATE "settlement_events" SET "tx_hash" = NULL;
