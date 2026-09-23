import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { MAX_BLOCK_DELAY_MS } from "@cityroam/shared/constants";
import { db, schema } from "../db/index.js";
import { redis } from "../redis/client.js";
import { runGroup } from "./group-runner.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("group-reconciler");

/**
 * How quiet an event has to be before we treat its group run as stranded.
 *
 * Must stay clear of MAX_BLOCK_DELAY_MS: a run that is merely waiting out a
 * long block delay looks exactly like a stranded one, and resuming it would
 * double-send. Doubling the longest legal delay leaves a full delay of margin.
 */
export const STRANDED_AFTER_MS = MAX_BLOCK_DELAY_MS * 2;

/** Lock TTL — long enough to cover a full group run. */
const RESUME_LOCK_TTL_SECONDS = 900;

/**
 * How often to re-scan. A single startup pass would miss the common case: a
 * container restarting seconds after the last message leaves an event that
 * doesn't look stranded yet and would never be looked at again.
 */
const SCAN_INTERVAL_MS = 60_000;

let scanTimer: ReturnType<typeof setInterval> | null = null;

function resumeLockKey(eventId: string): string {
  return `group-resume:${eventId}`;
}

/**
 * Matches IN_PROGRESS events that are not parked on a block and still have a
 * group to finish — i.e. nothing is scheduled to send their next message.
 */
export function strandedCandidateFilter(): SQL | undefined {
  return and(
    eq(schema.events.status, "IN_PROGRESS"),
    isNull(schema.events.current_block_id),
    isNotNull(schema.events.current_group_id),
  );
}

/**
 * Whether an event that last did something at `lastActivityMs` has been quiet
 * long enough to be considered stranded rather than mid-delay.
 */
export function isStranded(lastActivityMs: number | null, now = Date.now()): boolean {
  if (lastActivityMs === null) return true;
  return now - lastActivityMs >= STRANDED_AFTER_MS;
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
 * nothing scheduled to send the rest — the hunt simply stops. This picks
 * those up and resumes from the persisted block index.
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
    .where(strandedCandidateFilter());

  let resumed = 0;

  for (const event of candidates) {
    try {
      const lastActivity = await lastActivityAt(event.id, event.started_at);
      if (!isStranded(lastActivity)) {
        // Too recent to be sure it isn't still running elsewhere. A later
        // pass will pick it up once it ages past the threshold.
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

/**
 * Start the reconcile scan. Runs once immediately, then on an interval.
 * Safe to call multiple times — only one timer will be active.
 */
export function startGroupReconciler(): void {
  if (scanTimer) return;

  const scan = () =>
    reconcileStrandedGroups().catch((err) =>
      log.error("reconcile pass failed", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );

  scan();
  scanTimer = setInterval(scan, SCAN_INTERVAL_MS);

  log.info("reconciler started", {
    interval_ms: SCAN_INTERVAL_MS,
    stranded_after_ms: STRANDED_AFTER_MS,
  });
}

/**
 * Stop the reconcile scan (used during graceful shutdown).
 */
export function stopGroupReconciler(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}
