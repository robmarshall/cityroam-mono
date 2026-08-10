import { redis } from "../redis/client.js";
import { PARTICIPANT_OFFLINE_TIMEOUT_MS } from "@cityroam/shared/constants";
import { db } from "../db/index.js";
import { participants } from "../db/schema/index.js";
import { eq, and, count } from "drizzle-orm";
import { publishControl } from "../redis/pubsub.js";
import { deleteSession } from "../redis/session.js";
import { ensureActiveLead } from "../services/lead.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("presence");

const PRESENCE_TTL_SECONDS = 900; // 15 minutes

function presenceKey(eventCode: string, participantId: string): string {
  return `presence:${eventCode}:${participantId}`;
}

export async function updatePresence(
  eventCode: string,
  participantId: string,
): Promise<void> {
  const key = presenceKey(eventCode, participantId);
  await redis.set(key, new Date().toISOString(), "EX", PRESENCE_TTL_SECONDS);
}

export async function getPresence(
  eventCode: string,
  participantId: string,
): Promise<string | null> {
  return redis.get(presenceKey(eventCode, participantId));
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startPresenceSweep(
  hasConnectionFn: (participantId: string, eventCode: string) => boolean,
  getEventCodesFn: () => string[],
): void {
  if (sweepInterval) return;

  sweepInterval = setInterval(async () => {
    const eventCodes = getEventCodesFn();

    for (const code of eventCodes) {
      try {
        // Use SCAN instead of KEYS to avoid blocking Redis
        const keys: string[] = [];
        let cursor = "0";
        do {
          const [nextCursor, batch] = await redis.scan(
            cursor,
            "MATCH",
            `presence:${code}:*`,
            "COUNT",
            100,
          );
          cursor = nextCursor;
          keys.push(...batch);
        } while (cursor !== "0");

        for (const key of keys) {
          const lastSeenIso = await redis.get(key);
          if (!lastSeenIso) continue;

          const lastSeenAt = new Date(lastSeenIso).getTime();
          const elapsed = Date.now() - lastSeenAt;

          if (elapsed <= PARTICIPANT_OFFLINE_TIMEOUT_MS) continue;

          // Parse participantId from key format presence:{eventCode}:{participantId}
          const parts = key.split(":");
          const participantId = parts[2];
          if (!participantId) continue;

          // Only timeout if participant has no active WS connection
          if (hasConnectionFn(participantId, code)) continue;

          // Look up participant for event_id, display_name and session token
          const [participant] = await db
            .select({
              id: participants.id,
              event_id: participants.event_id,
              display_name: participants.display_name,
              token: participants.token,
            })
            .from(participants)
            .where(eq(participants.id, participantId))
            .limit(1);

          if (!participant) continue;

          // Update DB: mark inactive and drop the lead flag
          await db
            .update(participants)
            .set({
              is_active: false,
              is_lead: false,
              left_at: new Date(),
              left_reason: "timeout",
            })
            .where(eq(participants.id, participantId));

          // Drop the Redis session so HTTP stops authenticating a swept
          // participant off the fast path — the DB fallback already rejects
          // inactive rows, and rejoining reactivates them.
          await deleteSession(participant.token);

          // Promote a replacement if the swept participant was the lead
          await ensureActiveLead(participant.event_id, code);

          // Count remaining active participants for this event
          const [result] = await db
            .select({ value: count() })
            .from(participants)
            .where(
              and(
                eq(participants.event_id, participant.event_id),
                eq(participants.is_active, true),
              ),
            );

          const participantCount = Number(result?.value ?? 0);

          // Publish control event
          await publishControl(code, {
            type: "participant_left",
            data: {
              name: participant.display_name,
              participant_count: participantCount,
              reason: "timeout",
            },
          });

          // Clean up the presence key
          await redis.del(key);
        }
      } catch (err) {
        log.error("sweep error", { eventCode: code, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }, 60_000);
}

export function stopPresenceSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }
}
