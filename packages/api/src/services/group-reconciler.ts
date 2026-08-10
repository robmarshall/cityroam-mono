import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { redis } from "../redis/client.js";
import { runGroup } from "./group-runner.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("group-reconciler");

/**
 * How quiet an event has to be before we treat its group run as stranded.
 * Comfortably longer than the longest block delay, so a run still in flight
 * in the other process is never resumed underneath itself.
 */
const STRANDED_AFTER_MS = 5 * 60 * 1000;

/** Lock TTL — long enough to cover a full group run. */
const RESUME_LOCK_TTL_SECONDS = 900;

function resumeLockKey(eventId: string): string {
  return `group-resume:${eventId}`;
}

/**
 * Claim the right to resume an event's group. Returns false if another
 * process (or an earlier pass of this one) already holds the claim.
 */
async function claimResume(eventId: string): Promise<boolean> {
  const result = await redis.set(
    resumeLockKey(eventId),
    "1",
    "EX",
    RESUME_LOCK_TTL_SECONDS,
    "NX",
  );
  return result === "OK";
}

/**
 * Find IN_PROGRESS events whose group run died mid-flight and restart it.
 *
 * runGroup and advanceAfterBlock sleep between blocks, so a process restart
 * partway through a group leaves the event with no current_block_id and
 * nothing scheduled to send the rest — the hunt simply stops. On startup we
 * pick those up and resume from the persisted block index.
 *
 * Returns the number of events resumed.
 */
export async function reconcileStrandedGroups(): Promise<number> {
  const candidates = await db
    .select({
      id: schema.events.id,
      code: schema.events.code,
      current_group_id: schema.events.current_group_id,
      current_block_index: schema.events.current_block_index,
      started_at: schema.events.started_at,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.status, "IN_PROGRESS"),
        isNull(schema.events.current_block_id),
        isNotNull(schema.events.current_group_id),
      ),
    );

  let resumed = 0;

  for (const event of candidates) {
    try {
      const lastActivity = await lastActivityAt(event.id, event.started_at);
      if (lastActivity !== null && Date.now() - lastActivity < STRANDED_AFTER_MS) {
        // Too recent to be sure it isn't still running elsewhere
        continue;
      }

      if (!(await claimResume(event.id))) continue;

      log.info("resuming stranded group", {
        eventCode: event.code,
        groupId: event.current_group_id,
        fromIndex: event.current_block_index,
      });

      runGroup(
        event.id,
        event.code,
        event.current_group_id!,
        event.current_block_index,
      ).catch((err) => {
        log.error("resume failed", {
          eventCode: event.code,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      resumed++;
    } catch (err) {
      log.error("reconcile error", {
        eventCode: event.code,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (resumed > 0) {
    log.info("resumed stranded groups", { count: resumed });
  }

  return resumed;
}

/**
 * Timestamp of the last thing that happened in an event, falling back to when
 * it started. Null when neither is known, which we treat as stranded.
 */
async function lastActivityAt(
  eventId: string,
  startedAt: Date | null,
): Promise<number | null> {
  const [latest] = await db
    .select({ created_at: schema.messages.created_at })
    .from(schema.messages)
    .where(eq(schema.messages.event_id, eventId))
    .orderBy(desc(schema.messages.created_at))
    .limit(1);

  if (latest?.created_at) return new Date(latest.created_at).getTime();
  if (startedAt) return new Date(startedAt).getTime();
  return null;
}
