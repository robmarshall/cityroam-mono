import { eq, and } from "drizzle-orm";
import {
  IDLE_PROMPT_TIMEOUT_MS,
  IDLE_PAUSE_TIMEOUT_MS,
} from "@cityroam/shared/constants";
import type { ChatMessagePayload } from "@cityroam/shared/types";
import { db, schema } from "../../db/index.js";
import { appendMessage, publishMessage } from "../../redis/index.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("idle-timer");

/**
 * Idle state for a tracked event.
 */
interface IdleState {
  lastMessageTimestamp: number;
  nudgeSent: boolean;
  pauseSent: boolean;
  eventId: string;
}

/** In-memory map of eventCode → idle state for all IN_PROGRESS events */
const trackedEvents = new Map<string, IdleState>();

/** Reference to the scanning interval */
let scanInterval: ReturnType<typeof setInterval> | null = null;

/** Interval frequency for scanning idle events (60 seconds) */
const SCAN_INTERVAL_MS = 60_000;

/**
 * Write a system message using the three-step write sequence (DB → cache → pub/sub).
 * Does NOT increment guide_response_count.
 */
async function writeSystemMessage(
  eventId: string,
  eventCode: string,
  stepNumber: number,
  content: string,
): Promise<void> {
  const [msg] = await db
    .insert(schema.messages)
    .values({
      event_id: eventId,
      step_number: stepNumber,
      sender_type: "system",
      sender_name: "System",
      content,
      participant_id: null,
      image_url: null,
    })
    .returning();

  const payload: ChatMessagePayload = {
    id: msg.id,
    sender_type: msg.sender_type as ChatMessagePayload["sender_type"],
    sender_name: msg.sender_name,
    participant_id: msg.participant_id,
    content: msg.content,
    image_url: msg.image_url ?? null,
    step_number: msg.step_number,
    created_at: new Date(msg.created_at).toISOString(),
  };

  await appendMessage(eventCode, payload);
  await publishMessage(eventCode, payload);
}

/**
 * Update the idle timer for an event. Called on every incoming message.
 * Returns true if the event was in a paused state (caller should send welcome-back).
 */
export function updateIdleTimestamp(
  eventCode: string,
  eventId: string,
): boolean {
  const existing = trackedEvents.get(eventCode);
  const wasPaused = existing?.pauseSent ?? false;

  trackedEvents.set(eventCode, {
    lastMessageTimestamp: Date.now(),
    nudgeSent: false,
    pauseSent: false,
    eventId,
  });

  return wasPaused;
}

/**
 * Handle the "welcome back" message when a paused event receives a new message.
 * Sends the current clue so the player knows where they left off.
 */
export async function handleIdleResume(
  eventId: string,
  eventCode: string,
): Promise<void> {
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    columns: { current_stop: true, route_id: true },
  });

  if (!event) return;

  const stop = await db.query.stops.findFirst({
    where: and(
      eq(schema.stops.route_id, event.route_id),
      eq(schema.stops.stop_number, event.current_stop),
    ),
    columns: { clue: true },
  });

  const clue = stop?.clue ?? "your current clue";
  await writeSystemMessage(
    eventId,
    eventCode,
    event.current_stop,
    `Welcome back. Here's your current clue: "${clue}"`,
  );
}

/**
 * Remove an event from idle tracking (e.g. on COMPLETED status).
 */
export function removeFromIdleTracking(eventCode: string): void {
  trackedEvents.delete(eventCode);
}

/**
 * Scan all tracked events and send nudge/pause messages as needed.
 */
async function scanIdleEvents(): Promise<void> {
  const now = Date.now();

  for (const [eventCode, state] of trackedEvents) {
    const elapsed = now - state.lastMessageTimestamp;

    try {
      if (elapsed > IDLE_PAUSE_TIMEOUT_MS && !state.pauseSent) {
        // Verify event is still IN_PROGRESS before sending
        const event = await db.query.events.findFirst({
          where: eq(schema.events.id, state.eventId),
          columns: { status: true, current_stop: true },
        });

        if (!event || event.status !== "IN_PROGRESS") {
          trackedEvents.delete(eventCode);
          continue;
        }

        await writeSystemMessage(
          state.eventId,
          eventCode,
          event.current_stop,
          "It's been a while — the hunt is paused. Send any message to pick up where you left off.",
        );
        state.pauseSent = true;
        state.nudgeSent = true; // No need to send nudge if pause already sent
      } else if (elapsed > IDLE_PROMPT_TIMEOUT_MS && !state.nudgeSent) {
        const event = await db.query.events.findFirst({
          where: eq(schema.events.id, state.eventId),
          columns: { status: true, current_stop: true },
        });

        if (!event || event.status !== "IN_PROGRESS") {
          trackedEvents.delete(eventCode);
          continue;
        }

        await writeSystemMessage(
          state.eventId,
          eventCode,
          event.current_stop,
          "Still exploring? Send a message when you're ready to continue.",
        );
        state.nudgeSent = true;
      }
    } catch (err) {
      log.error("scan error", { eventCode, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * Start the idle timeout scanner. Should be called once on HTTP server startup.
 */
export function startIdleTimer(): void {
  if (scanInterval) return; // Already running
  scanInterval = setInterval(scanIdleEvents, SCAN_INTERVAL_MS);
  log.info("started scanning", { interval_ms: SCAN_INTERVAL_MS });
}

/**
 * Stop the idle timeout scanner. Called during graceful shutdown.
 */
export function stopIdleTimer(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    trackedEvents.clear();
    log.info("stopped");
  }
}

/**
 * Get the current tracked events map (for testing).
 */
export function getTrackedEvents(): Map<string, IdleState> {
  return trackedEvents;
}
