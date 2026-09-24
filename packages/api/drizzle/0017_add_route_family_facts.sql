CREATE TABLE "route_family_facts" (
	"route_family_id" uuid PRIMARY KEY NOT NULL,
	"start_label" jsonb,
	"start_lat" double precision,
	"start_lng" double precision,
	"start_map_url" varchar(500),
	"distance_km" numeric(5, 2),
	"duration_mins" integer,
	"stops" integer,
	"step_free" varchar,
	"dogs" boolean,
	"toilets" varchar,
	"covered" varchar,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_family_facts_start_point_check" CHECK (("route_family_facts"."start_label" IS NULL AND "route_family_facts"."start_lat" IS NULL AND "route_family_facts"."start_lng" IS NULL AND "route_family_facts"."start_map_url" IS NULL) OR ("route_family_facts"."start_label" IS NOT NULL AND "route_family_facts"."start_lat" IS NOT NULL AND "route_family_facts"."start_lng" IS NOT NULL AND "route_family_facts"."start_map_url" IS NOT NULL)),
	CONSTRAINT "route_family_facts_step_free_check" CHECK ("route_family_facts"."step_free" IN ('yes', 'mostly', 'no')),
	CONSTRAINT "route_family_facts_toilets_check" CHECK ("route_family_facts"."toilets" IN ('at_start', 'on_route', 'none')),
	CONSTRAINT "route_family_facts_covered_check" CHECK ("route_family_facts"."covered" IN ('none', 'some', 'most'))
);
--> statement-breakpoint
ALTER TABLE "route_family_facts" ADD CONSTRAINT "route_family_facts_route_family_id_route_families_id_fk" FOREIGN KEY ("route_family_id") REFERENCES "public"."route_families"("id") ON DELETE cascade ON UPDATE no action;