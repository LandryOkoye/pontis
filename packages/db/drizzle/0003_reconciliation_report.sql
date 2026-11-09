CREATE TABLE "reconciliation_report" (
	"name" text PRIMARY KEY NOT NULL,
	"report" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
