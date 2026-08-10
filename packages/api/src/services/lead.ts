import { and, asc, eq, ne, sql } from "drizzle-orm";
import { TERMINAL_STATUSES } from "@cityroam/shared/constants";
import { db } from "../db/index.js";
import { events, participants } from "../db/schema/index.js";
import { setSession, publishControl } from "../redis/index.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("lead");

export interface LeadReassignment {
  participant_id: string;
  display_name: string;
}

/**
 * Make sure the event has an active lead, promoting the oldest active
 * participant if the current lead has left or been swept offline.
 *
 * Call this after any change that can leave an event leaderless (voluntary
 * leave, presence timeout). Safe to call when a lead already exists — it
 * returns null without touching anything.
 *
 * On promotion it updates the DB, refreshes the promoted participant's Redis
 * session (so HTTP and WS both see is_lead=true before their 24h TTL expires)
 * and publishes a `lead_changed` control event.
 */
export async function ensureActiveLead(
  eventId: string,
  eventCode: string,
): Promise<LeadReassignment | null> {
  const promoted = await db.transaction(async (tx) => {
    // Serialize against concurrent joins/leaves for this event
    await tx.execute(sql`SELECT 1 FROM events WHERE id = ${eventId} FOR UPDATE`);

    const event = await tx.query.events.findFirst({
      where: eq(events.id, eventId),
      columns: { status: true },
    });

    if (!event || TERMINAL_STATUSES.has(event.status)) return null;

    const existingLead = await tx.query.participants.findFirst({
      where: and(
        eq(participants.event_id, eventId),
        eq(participants.is_active, true),
        eq(participants.is_lead, true),
      ),
      columns: { id: true },
    });

    if (existingLead) return null;

    const nextLead = await tx.query.participants.findFirst({
      where: and(
        eq(participants.event_id, eventId),
        eq(participants.is_active, true),
      ),
      orderBy: asc(participants.joined_at),
      columns: { id: true, token: true, display_name: true },
    });

    if (!nextLead) {
      // Nobody left to lead — clear the pointer so a returning player can claim it
      await tx
        .update(events)
        .set({ lead_participant_id: null })
        .where(eq(events.id, eventId));
      return null;
    }

    // Clear any stale is_lead flags left on inactive rows
    await tx
      .update(participants)
      .set({ is_lead: false })
      .where(
        and(
          eq(participants.event_id, eventId),
          eq(participants.is_lead, true),
          ne(participants.id, nextLead.id),
        ),
      );

    await tx
      .update(participants)
      .set({ is_lead: true })
      .where(eq(participants.id, nextLead.id));

    await tx
      .update(events)
      .set({ lead_participant_id: nextLead.id })
      .where(eq(events.id, eventId));

    return nextLead;
  });

  if (!promoted) return null;

  // Refresh the promoted participant's session so the stale is_lead=false
  // copy doesn't survive for the rest of the session TTL
  try {
    await setSession(promoted.token, {
      participant_id: promoted.id,
      event_id: eventId,
      event_code: eventCode,
      display_name: promoted.display_name,
      is_lead: true,
    });
  } catch (err) {
    log.warn("failed to refresh promoted lead session", {
      eventCode,
      participantId: promoted.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await publishControl(eventCode, {
    type: "lead_changed",
    data: { participant_id: promoted.id, name: promoted.display_name },
  });

  log.info("lead reassigned", { eventCode, participantId: promoted.id });

  return { participant_id: promoted.id, display_name: promoted.display_name };
}
