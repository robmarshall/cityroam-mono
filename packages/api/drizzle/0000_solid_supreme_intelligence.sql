CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(8) NOT NULL,
	"status" varchar DEFAULT 'NOT_STARTED' NOT NULL,
	"route_id" uuid NOT NULL,
	"stripe_session_id" varchar,
	"stripe_payment_id" varchar,
	"buyer_email" varchar,
	"lead_participant_id" uuid,
	"current_stop" integer DEFAULT 0 NOT NULL,
	"hints_given" integer DEFAULT 0 NOT NULL,
	"wrong_attempts" integer DEFAULT 0 NOT NULL,
	"guide_response_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "events_code_unique" UNIQUE("code"),
	CONSTRAINT "events_status_check" CHECK ("events"."status" IN ('NOT_STARTED', 'WAITING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "message_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_banks_type_check" CHECK ("message_banks"."type" IN ('success', 'failure', 'hint-exhausted', 'clarification', 'unknown-answer', 'opening', 'completion', 'over-length'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"sender_type" varchar NOT NULL,
	"sender_name" varchar NOT NULL,
	"participant_id" uuid,
	"content" text NOT NULL,
	"image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sender_type_check" CHECK ("messages"."sender_type" IN ('user', 'guide', 'system'))
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"display_name" varchar(30) NOT NULL,
	"token" varchar NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"left_reason" varchar,
	CONSTRAINT "participants_token_unique" UNIQUE("token"),
	CONSTRAINT "participants_left_reason_check" CHECK ("participants"."left_reason" IS NULL OR "participants"."left_reason" IN ('voluntary', 'timeout'))
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"total_stops" integer NOT NULL,
	"estimated_duration_mins" integer NOT NULL,
	"estimated_distance_km" numeric NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"stop_number" integer NOT NULL,
	"name" varchar NOT NULL,
	"directions_from_previous" text NOT NULL,
	"clue" text NOT NULL,
	"accepted_answers" jsonb NOT NULL,
	"hints" jsonb NOT NULL,
	"correct_response" text,
	"fun_fact" text NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"google_maps_link" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stops_route_id_stop_number_unique" UNIQUE("route_id","stop_number")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_code_idx" ON "events" USING btree ("code");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_banks_type_idx" ON "message_banks" USING btree ("type");--> statement-breakpoint
CREATE INDEX "messages_event_id_created_at_idx" ON "messages" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "participants_event_id_idx" ON "participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "participants_token_idx" ON "participants" USING btree ("token");