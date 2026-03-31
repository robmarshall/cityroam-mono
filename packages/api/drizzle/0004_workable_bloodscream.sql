CREATE TABLE "opening_sequence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"image_url" text,
	"delay_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opening_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opening_sequence_items" ADD CONSTRAINT "opening_sequence_items_sequence_id_opening_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."opening_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opening_sequence_items_sequence_id_idx" ON "opening_sequence_items" USING btree ("sequence_id");--> statement-breakpoint
-- Migrate hints column from string[] to SequenceItem[][]
-- Convert ["hint1", "hint2"] → [[{"content":"hint1","image_url":null,"delay_ms":0}], [{"content":"hint2","image_url":null,"delay_ms":0}]]
UPDATE "stops"
SET "hints" = (
  SELECT jsonb_agg(
    jsonb_build_array(
      jsonb_build_object('content', hint_text::text, 'image_url', null, 'delay_ms', 0)
    )
  )
  FROM jsonb_array_elements_text("hints") AS hint_text
)
WHERE jsonb_typeof("hints") = 'array'
  AND jsonb_array_length("hints") > 0
  AND jsonb_typeof("hints"->0) = 'string';