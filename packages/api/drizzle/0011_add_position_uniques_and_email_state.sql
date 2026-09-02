-- Confirmation-email delivery state. The event code only reaches the buyer by
-- email, so a send that fails after every retry has to be visible in the admin
-- event list rather than only in a log line.
ALTER TABLE "events" ADD COLUMN "code_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "code_email_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "code_email_error" text;--> statement-breakpoint

-- One ACTIVE route per (family, language).
--
-- Checkout resolves a purchase with family + language + is_active -> findFirst
-- (resolveRouteInFamily in routes/checkout.ts), so two active rows for the same
-- pair make the buyer's hunt arbitrary. Inactive rows stay unconstrained: old
-- versions and drafts of a translation are legitimate.
--
-- If this migration fails with a duplicate key error, find the offenders with:
--   SELECT route_family_id, language, count(*), array_agg(id)
--   FROM routes WHERE is_active
--   GROUP BY route_family_id, language HAVING count(*) > 1;
-- and deactivate all but the one that should be sold.
CREATE UNIQUE INDEX "routes_family_language_active_unique" ON "routes" USING btree ("route_family_id","language") WHERE is_active;--> statement-breakpoint

-- Dense, collision-free positions for groups and blocks.
--
-- `events.current_block_index` is a plain offset into a group's blocks ordered
-- by position, and the runner walks groups the same way, so a tie makes "the
-- next thing to send" arbitrary. The renumber below is order-preserving — it
-- only closes gaps and breaks ties deterministically — so a live event's stored
-- offset still points at the same block afterwards.
--
-- To see what the renumber will touch before running it:
--   SELECT group_id, position, count(*) FROM route_blocks
--   GROUP BY group_id, position HAVING count(*) > 1;
--   SELECT route_id, position, count(*) FROM route_groups
--   GROUP BY route_id, position HAVING count(*) > 1;
UPDATE "route_groups" AS g
SET "position" = o.new_position
FROM (
  SELECT id, (row_number() OVER (PARTITION BY route_id ORDER BY "position", created_at, id) - 1)::int AS new_position
  FROM "route_groups"
) AS o
WHERE g.id = o.id AND g."position" <> o.new_position;--> statement-breakpoint

UPDATE "route_blocks" AS b
SET "position" = o.new_position
FROM (
  SELECT id, (row_number() OVER (PARTITION BY group_id ORDER BY "position", created_at, id) - 1)::int AS new_position
  FROM "route_blocks"
) AS o
WHERE b.id = o.id AND b."position" <> o.new_position;--> statement-breakpoint

-- DEFERRABLE INITIALLY DEFERRED, which drizzle's schema DSL cannot express, so
-- these two statements are hand-written and differ from the generated snapshot
-- in that one respect. Deferring is what keeps the admin reorder, delete and
-- move endpoints working as a single CASE update per table: the intermediate
-- rows collide, only the committed ones are checked. A non-deferrable
-- constraint would reject "shift everything up by one" outright.
ALTER TABLE "route_blocks" ADD CONSTRAINT "route_blocks_group_id_position_unique" UNIQUE("group_id","position") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "route_groups" ADD CONSTRAINT "route_groups_route_id_position_unique" UNIQUE("route_id","position") DEFERRABLE INITIALLY DEFERRED;
