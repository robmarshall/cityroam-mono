CREATE TABLE "route_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" varchar NOT NULL,
	"config" jsonb NOT NULL,
	"delay_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_blocks_type_check" CHECK ("route_blocks"."type" IN ('message', 'image', 'question', 'action', 'map'))
);
--> statement-breakpoint
CREATE TABLE "route_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "current_group_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "current_block_id" uuid;--> statement-breakpoint
ALTER TABLE "route_blocks" ADD CONSTRAINT "route_blocks_group_id_route_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."route_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_groups" ADD CONSTRAINT "route_groups_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_blocks_group_id_idx" ON "route_blocks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "route_groups_route_id_idx" ON "route_groups" USING btree ("route_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_current_group_id_route_groups_id_fk" FOREIGN KEY ("current_group_id") REFERENCES "public"."route_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_current_block_id_route_blocks_id_fk" FOREIGN KEY ("current_block_id") REFERENCES "public"."route_blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Data migration: convert existing stops into route_groups and route_blocks.
-- Each stop becomes one group with blocks: directions message, image(s), question, fun_fact message.

-- 1. Create a route_group for each stop
INSERT INTO "route_groups" ("id", "route_id", "position", "name")
SELECT gen_random_uuid(), s.route_id, s.stop_number, s.name
FROM "stops" s
ORDER BY s.route_id, s.stop_number;

-- 2. Create blocks within each group.
-- We use a CTE to join stops with their newly created groups.

-- 2a. Directions message block (position 0, only if directions text is non-empty)
INSERT INTO "route_blocks" ("id", "group_id", "position", "type", "config", "delay_ms")
SELECT gen_random_uuid(), rg.id, 0, 'message',
  jsonb_build_object('type', 'message', 'content', s.directions_from_previous),
  0
FROM "stops" s
JOIN "route_groups" rg ON rg.route_id = s.route_id AND rg.position = s.stop_number
WHERE s.directions_from_previous IS NOT NULL AND s.directions_from_previous != '';

-- 2b. Image blocks (position 1+, one per image in the images array)
INSERT INTO "route_blocks" ("id", "group_id", "position", "type", "config", "delay_ms")
SELECT gen_random_uuid(), rg.id, (1 + idx.ordinality - 1), 'image',
  jsonb_build_object('type', 'image', 'image_url', idx.value #>> '{}'),
  0
FROM "stops" s
JOIN "route_groups" rg ON rg.route_id = s.route_id AND rg.position = s.stop_number
CROSS JOIN LATERAL jsonb_array_elements(s.images) WITH ORDINALITY AS idx(value, ordinality)
WHERE jsonb_array_length(s.images) > 0;

-- 2c. Map block (after images, before question)
INSERT INTO "route_blocks" ("id", "group_id", "position", "type", "config", "delay_ms")
SELECT gen_random_uuid(), rg.id,
  (1 + COALESCE((SELECT jsonb_array_length(s2.images) FROM stops s2 WHERE s2.id = s.id), 0)),
  'map',
  jsonb_build_object('type', 'map', 'google_maps_link', s.google_maps_link),
  0
FROM "stops" s
JOIN "route_groups" rg ON rg.route_id = s.route_id AND rg.position = s.stop_number
WHERE s.google_maps_link IS NOT NULL AND s.google_maps_link != '';

-- 2d. Question block (after directions + images + map)
INSERT INTO "route_blocks" ("id", "group_id", "position", "type", "config", "delay_ms")
SELECT gen_random_uuid(), rg.id,
  (1
    + COALESCE((SELECT jsonb_array_length(s2.images) FROM stops s2 WHERE s2.id = s.id), 0)
    + CASE WHEN s.google_maps_link IS NOT NULL AND s.google_maps_link != '' THEN 1 ELSE 0 END
  ),
  'question',
  jsonb_build_object(
    'type', 'question',
    'clue', s.clue,
    'accepted_answers', s.accepted_answers,
    'hints', s.hints
  ),
  0
FROM "stops" s
JOIN "route_groups" rg ON rg.route_id = s.route_id AND rg.position = s.stop_number;

-- 2e. Fun fact message block (last position in group)
INSERT INTO "route_blocks" ("id", "group_id", "position", "type", "config", "delay_ms")
SELECT gen_random_uuid(), rg.id,
  (2
    + COALESCE((SELECT jsonb_array_length(s2.images) FROM stops s2 WHERE s2.id = s.id), 0)
    + CASE WHEN s.google_maps_link IS NOT NULL AND s.google_maps_link != '' THEN 1 ELSE 0 END
  ),
  'message',
  jsonb_build_object('type', 'message', 'content', s.fun_fact),
  0
FROM "stops" s
JOIN "route_groups" rg ON rg.route_id = s.route_id AND rg.position = s.stop_number;

-- 3. Migrate current_stop on active (IN_PROGRESS) events to current_group_id + current_block_id.
-- Set current_group_id to the group matching the event's current stop number.
-- Set current_block_id to the question block within that group.
UPDATE "events" e
SET
  current_group_id = rg.id,
  current_block_id = rb.id
FROM "route_groups" rg
JOIN "route_blocks" rb ON rb.group_id = rg.id AND rb.type = 'question'
WHERE e.status = 'IN_PROGRESS'
  AND rg.route_id = e.route_id
  AND rg.position = e.current_stop;