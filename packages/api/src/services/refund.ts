import { eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { events } from "../db/schema/index.js";
import { deleteSessionsByEventId } from "../redis/session.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("refund");

/**
 * The single place an event becomes REFUNDED.
 *
 * Three paths reach it: an admin pressing refund, Stripe telling us the charge
 * was already refunded, and a refund or dispute raised straight from the Stripe
 * dashboard. They must all leave the same wreckage behind — status flipped and
 * every player session invalidated — or a dashboard refund quietly leaves the
 * hunt playable.
 */
export async function markEventRefunded(
  eventId: string,
  source: string,
): Promise<void> {
  await db.update(events).set({ status: "REFUNDED" }).where(eq(events.id, eventId));

  try {
    await deleteSessionsByEventId(eventId);
  } catch (err) {
    log.warn("failed to invalidate sessions after refund", {
      event_id: eventId,
      source,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  log.info("event marked refunded", { event_id: eventId, source });
}

/**
 * Finds the event behind a Stripe charge or dispute. Events record both the
 * checkout session id and the payment intent id, and a charge only carries the
 * latter, so the payment intent is the primary key here and the session id is
 * a fallback for anything that happens to carry one.
 */
export async function findEventByStripeRefs(refs: {
  paymentIntentId?: string | null;
  sessionId?: string | null;
}) {
  const clauses = [];
  if (refs.paymentIntentId) {
    clauses.push(eq(events.stripe_payment_id, refs.paymentIntentId));
  }
  if (refs.sessionId) {
    clauses.push(eq(events.stripe_session_id, refs.sessionId));
  }

  if (clauses.length === 0) return null;

  return (
    (await db.query.events.findFirst({
      where: clauses.length === 1 ? clauses[0] : or(...clauses),
    })) ?? null
  );
}
