CREATE TABLE "redemption_payout_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"representation_id" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"terms_hash" text NOT NULL,
	"payout_instruction_hash" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redemption_id" bigint
);
--> statement-breakpoint
CREATE TABLE "redemption_refusals" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"reason" text NOT NULL,
	"sender_id" text NOT NULL,
	"token" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "redemption_refusals_receipt_log_key" UNIQUE("receipt_id","log_index")
);
--> statement-breakpoint
CREATE INDEX "redemption_payout_hash_idx" ON "redemption_payout_instructions" USING btree ("account_id","payout_instruction_hash");--> statement-breakpoint
CREATE INDEX "redemption_payout_redemption_idx" ON "redemption_payout_instructions" USING btree ("redemption_id");--> statement-breakpoint
CREATE INDEX "redemption_refusals_sender_idx" ON "redemption_refusals" USING btree ("sender_id","at");