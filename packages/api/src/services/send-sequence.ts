import type { SequenceItem } from "@cityroam/shared/types";
import { publishTyping } from "../redis/index.js";
import { writeGuideMessage } from "./pipeline/handlers/answer-attempt.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("send-sequence");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a sequence of message items with delays and typing indicators.
 * Each item may have a delay_ms which pauses before sending (showing typing indicator).
 * Template variables in content are replaced using the provided templateVars map.
 */
export async function sendSequence(
  eventId: string,
  eventCode: string,
  stepNumber: number,
  items: SequenceItem[],
  templateVars?: Record<string, string>,
): Promise<void> {
  for (const item of items) {
    try {
      if (item.delay_ms > 0) {
        await publishTyping(eventCode, {
          type: "guide_typing",
          participant_name: null,
          participant_id: null,
          is_typing: true,
        });
        await sleep(item.delay_ms);
        await publishTyping(eventCode, {
          type: "guide_typing",
          participant_name: null,
          participant_id: null,
          is_typing: false,
        });
      }

      let content = item.content;
      if (templateVars) {
        for (const [key, value] of Object.entries(templateVars)) {
          content = content.replaceAll(`{{${key}}}`, value);
        }
      }

      await writeGuideMessage(
        eventId,
        eventCode,
        stepNumber,
        content,
        item.image_url ?? null,
      );
    } catch (err) {
      log.error("failed to send sequence item", { eventId, eventCode, err });
    }
  }
}
