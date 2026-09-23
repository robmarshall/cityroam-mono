CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"actor_id" varchar(100) NOT NULL,
	"actor_name" varchar(100),
	"method" varchar(10) NOT NULL,
	"path" varchar(500) NOT NULL,
	"params" jsonb,
	"status" integer NOT NULL,
	"ip" varchar(64),
	"request_id" varchar(100),
	CONSTRAINT "admin_audit_log_actor_type_check" CHECK ("admin_audit_log"."actor_type" IN ('session', 'api_key'))
);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_id_created_at_idx" ON "admin_audit_log" USING btree ("actor_id","created_at");