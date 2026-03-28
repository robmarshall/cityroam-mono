import { and, lt, notInArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { events } from "../db/schema/index.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("expiry-sweep");

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Expire all events whose expires_at has passed and are not already
 * COMPLETED or EXPIRED. Runs as a background sweep every 6 hours.
 */
export async function sweepExpiredEvents(): Promise<number> {
  const result = await db
    .update(events)
    .set({ status: "EXPIRED" })
    .where(
      and(
        lt(events.expires_at, new Date()),
        notInArray(events.status, ["COMPLETED", "EXPIRED"]),
      ),
    )
    .returning({ id: events.id });

  if (result.length > 0) {
    log.info("expired events", { count: result.length });
  }

  return result.length;
}

/**
 * Start the background sweep interval (every 6 hours).
 * Safe to call multiple times — only one timer will be active.
 */
export function startExpirySweep(): void {
  if (sweepTimer) return;

  // Run once on startup, then every 6 hours
  sweepExpiredEvents().catch((err) =>
    log.error("sweep failed", { error: err instanceof Error ? err.message : String(err) }),
  );

  sweepTimer = setInterval(() => {
    sweepExpiredEvents().catch((err) =>
      log.error("sweep failed", { error: err instanceof Error ? err.message : String(err) }),
    );
  }, SIX_HOURS_MS);

  log.info("background sweep started", { interval_hours: 6 });
}

/**
 * Stop the background sweep (used during graceful shutdown).
 */
export function stopExpirySweep(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
