import { subscribeToIncomingPattern } from "../../redis/index.js";
import { processIncomingMessage } from "./orchestrator.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("incoming-sub");

let unsubscribe: (() => Promise<void>) | null = null;

/**
 * Start the background Redis subscriber that listens on `event:*:incoming`
 * and passes each payload to the pipeline orchestrator.
 *
 * Runs in the same Node.js event loop as the HTTP server.
 */
export async function startIncomingSubscriber(): Promise<void> {
  if (unsubscribe) return;

  unsubscribe = await subscribeToIncomingPattern((_code, payload) => {
    processIncomingMessage(payload).catch((err) =>
      log.error("pipeline error", { error: err instanceof Error ? err.message : String(err) }),
    );
  });

  log.info("subscribed to event:*:incoming");
}

/**
 * Stop the subscriber (used during graceful shutdown).
 */
export async function stopIncomingSubscriber(): Promise<void> {
  if (unsubscribe) {
    await unsubscribe();
    unsubscribe = null;
    log.info("unsubscribed");
  }
}
