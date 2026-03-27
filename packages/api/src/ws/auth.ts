import { getSession, setSession } from "../redis/session.js";
import { db } from "../db/index.js";
import { participants, events } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";

export const WS_CLOSE_CODES = {
  INVALID_TOKEN: 4001,
  EXPIRED_SESSION: 4002,
  EVENT_NOT_FOUND: 4003,
  EVENT_COMPLETED_OR_EXPIRED: 4004,
  PARTICIPANT_NOT_ACTIVE: 4005,
} as const;

export type AuthResult =
  | {
      success: true;
      session: {
        participant_id: string;
        event_id: string;
        event_code: string;
        display_name: string;
        is_lead: boolean;
      };
    }
  | {
      success: false;
      closeCode: number;
      reason: string;
    };

export async function authenticateConnection(
  eventCode: string,
  token: string | null,
): Promise<AuthResult> {
  // 1. No token provided
  if (!token) {
    return {
      success: false,
      closeCode: WS_CLOSE_CODES.INVALID_TOKEN,
      reason: "Missing authentication token",
    };
  }

  // 2. Check Redis session store
  let sessionData = await getSession(token);

  // 3. If Redis miss, fallback to DB
  if (!sessionData) {
    const row = await db
      .select({
        participant_id: participants.id,
        event_id: participants.event_id,
        event_code: events.code,
        display_name: participants.display_name,
        is_lead: participants.is_lead,
      })
      .from(participants)
      .innerJoin(events, eq(events.id, participants.event_id))
      .where(and(eq(participants.token, token), eq(participants.is_active, true)))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (row) {
      // 4. Re-populate Redis session store
      sessionData = {
        participant_id: row.participant_id,
        event_id: row.event_id,
        event_code: row.event_code,
        display_name: row.display_name,
        is_lead: row.is_lead,
      };
      await setSession(token, sessionData);
    }
  }

  // 5. No session found anywhere
  if (!sessionData) {
    return {
      success: false,
      closeCode: WS_CLOSE_CODES.INVALID_TOKEN,
      reason: "Invalid or expired token",
    };
  }

  // 6. Verify event_code matches URL param
  if (sessionData.event_code !== eventCode) {
    return {
      success: false,
      closeCode: WS_CLOSE_CODES.INVALID_TOKEN,
      reason: "Token does not match event",
    };
  }

  // 7. Check event status
  const event = await db
    .select({ id: events.id, status: events.status })
    .from(events)
    .where(eq(events.id, sessionData.event_id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!event) {
    return {
      success: false,
      closeCode: WS_CLOSE_CODES.EVENT_NOT_FOUND,
      reason: "Event not found",
    };
  }

  if (event.status === "COMPLETED" || event.status === "EXPIRED") {
    return {
      success: false,
      closeCode: WS_CLOSE_CODES.EVENT_COMPLETED_OR_EXPIRED,
      reason: "Event is completed or expired",
    };
  }

  // 8. Verify participant is still active
  const participant = await db
    .select({ is_active: participants.is_active })
    .from(participants)
    .where(eq(participants.id, sessionData.participant_id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!participant || !participant.is_active) {
    return {
      success: false,
      closeCode: WS_CLOSE_CODES.PARTICIPANT_NOT_ACTIVE,
      reason: "Participant is no longer active",
    };
  }

  // 9. Return success
  return {
    success: true,
    session: {
      participant_id: sessionData.participant_id,
      event_id: sessionData.event_id,
      event_code: sessionData.event_code,
      display_name: sessionData.display_name,
      is_lead: sessionData.is_lead,
    },
  };
}
