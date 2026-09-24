CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(12) NOT NULL,
	"status" varchar(16) DEFAULT 'PURCHASED' NOT NULL,
	"purchaser_email" varchar(254),
	"recipient_name" varchar(60),
	"message" varchar(300),
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"route_family_id" uuid,
	"amount_total" integer,
	"currency" varchar(3),
	"stripe_session_id" varchar,
	"stripe_payment_id" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_event_id" uuid,
	"refunded_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"email_sent_at" timestamp with time zone,
	"email_failed_at" timestamp with time zone,
	"email_error" text,
	CONSTRAINT "vouchers_status_check" CHECK ("vouchers"."status" IN ('PURCHASED', 'REDEEMED', 'REFUNDED', 'EXPIRED', 'VOID'))
);
--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_route_family_id_route_families_id_fk" FOREIGN KEY ("route_family_id") REFERENCES "public"."route_families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_redeemed_event_id_events_id_fk" FOREIGN KEY ("redeemed_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_code_unique" ON "vouchers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_stripe_session_id_unique" ON "vouchers" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_redeemed_event_id_unique" ON "vouchers" USING btree ("redeemed_event_id");--> statement-breakpoint
CREATE INDEX "vouchers_stripe_payment_id_idx" ON "vouchers" USING btree ("stripe_payment_id");--> statement-breakpoint
CREATE INDEX "vouchers_status_idx" ON "vouchers" USING btree ("status");