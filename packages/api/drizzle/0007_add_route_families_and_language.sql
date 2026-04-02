-- Migration: Add route_families table, language support to routes/events/message_banks
-- Strategy: Create route_families, migrate existing data, add FKs, drop routes.city

--> statement-breakpoint
CREATE TABLE "route_families" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar NOT NULL,
  "city" varchar NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create a route_family for each existing route using its city + name
--> statement-breakpoint
INSERT INTO "route_families" ("id", "name", "city", "created_at", "updated_at")
SELECT gen_random_uuid(), "name", "city", "created_at", "updated_at"
FROM "routes";

-- Add language and route_family_id columns to routes (nullable initially for migration)
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "language" varchar DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "route_family_id" uuid;

-- Link each route to its corresponding route_family (matched by name + city)
--> statement-breakpoint
UPDATE "routes" r
SET "route_family_id" = rf."id"
FROM "route_families" rf
WHERE rf."name" = r."name" AND rf."city" = r."city";

-- Make route_family_id NOT NULL and add FK
--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "route_family_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_route_family_id_route_families_id_fk" FOREIGN KEY ("route_family_id") REFERENCES "route_families"("id") ON DELETE no action ON UPDATE no action;

-- Drop city from routes (now lives on route_families)
--> statement-breakpoint
ALTER TABLE "routes" DROP COLUMN "city";

-- Add language and route_family_id to events
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "language" varchar DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "route_family_id" uuid;

-- Set route_family_id on events from their route's family
--> statement-breakpoint
UPDATE "events" e
SET "route_family_id" = r."route_family_id"
FROM "routes" r
WHERE r."id" = e."route_id";

-- Make route_family_id NOT NULL and add FK
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "route_family_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_route_family_id_route_families_id_fk" FOREIGN KEY ("route_family_id") REFERENCES "route_families"("id") ON DELETE no action ON UPDATE no action;

-- Add language to message_banks
--> statement-breakpoint
ALTER TABLE "message_banks" ADD COLUMN "language" varchar DEFAULT 'en' NOT NULL;

-- Replace the old type-only index with a composite (type, language) index
--> statement-breakpoint
DROP INDEX IF EXISTS "message_banks_type_idx";
--> statement-breakpoint
CREATE INDEX "message_banks_type_language_idx" ON "message_banks" USING btree ("type", "language");
