CREATE TABLE "admin_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"prefix" varchar(64) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"last4" char(4) NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_used_ip" varchar(64),
	"revoked_at" timestamp with time zone,
	"revoked_by" varchar,
	CONSTRAINT "admin_api_keys_token_hash_unique" UNIQUE("token_hash")
);
