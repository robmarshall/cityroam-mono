-- Remove all "opening" message bank entries
DELETE FROM "message_banks" WHERE "type" = 'opening';
--> statement-breakpoint
-- Update CHECK constraint to exclude "opening" (and include hint-offer, hint-decline)
ALTER TABLE "message_banks" DROP CONSTRAINT "message_banks_type_check";
--> statement-breakpoint
ALTER TABLE "message_banks" ADD CONSTRAINT "message_banks_type_check" CHECK ("message_banks"."type" IN ('success', 'failure', 'hint-exhausted', 'hint-offer', 'hint-decline', 'clarification', 'unknown-answer', 'completion', 'over-length'));
