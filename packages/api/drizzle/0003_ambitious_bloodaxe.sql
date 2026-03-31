ALTER TABLE "events" ADD COLUMN "refund_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "refund_note" text;