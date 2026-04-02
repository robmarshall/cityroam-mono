import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { writeGuideMessage, getRandomMessageBank } from "./answer-attempt.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("hint-nudge");

export interface HintNudgeContext {
  eventId: string;
  eventCode: string;
  currentStop: number;
}

/**
 * Handle a hint-nudge message.
 *
 * The player expressed frustration or being stuck without explicitly asking
 * for a hint. Send a "hint-offer" message bank prompt (e.g. "Do you need a hint?")
 * and set hint_offered = true so the next message can be checked for confirmation.
 */
export async function handleHintNudge(ctx: HintNudgeContext): Promise<void> {
  const offerMsg = await getRandomMessageBank("hint-offer");
  const content = offerMsg ?? "Would you like a hint?";

  await writeGuideMessage(ctx.eventId, ctx.eventCode, ctx.currentStop, content);

  await db
    .update(schema.events)
    .set({ hint_offered: true })
    .where(eq(schema.events.id, ctx.eventId));

  log.info("hint offered", { eventCode: ctx.eventCode });
}
