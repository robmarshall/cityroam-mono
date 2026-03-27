import { subscribeToIncomingPattern } from "../../redis/index.js";
import { processIncomingMessage } from "./orchestrator.js";

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
      console.error("[incoming-sub] pipeline error:", err),
    );
  });

  console.log("[incoming-sub] subscribed to event:*:incoming");
}

/**
 * Stop the subscriber (used during graceful shutdown).
 */
export async function stopIncomingSubscriber(): Promise<void> {
  if (unsubscribe) {
    await unsubscribe();
    unsubscribe = null;
    console.log("[incoming-sub] unsubscribed");
  }
}
