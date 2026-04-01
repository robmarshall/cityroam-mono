import { eq, asc } from "drizzle-orm";
import type { BlockConfig } from "@cityroam/shared/types";
import { db, schema } from "../db/index.js";
import { publishTyping, publishControl } from "../redis/index.js";
import { writeGuideMessage } from "./pipeline/handlers/answer-attempt.js";
import { handleGameCompletion } from "./pipeline/handlers/game-completion.js";
import { applyTemplateVars, buildRouteTemplateVars } from "./template-vars.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("group-runner");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load all blocks for a group, ordered by position.
 */
async function loadGroupBlocks(groupId: string) {
  return db
    .select()
    .from(schema.routeBlocks)
    .where(eq(schema.routeBlocks.group_id, groupId))
    .orderBy(asc(schema.routeBlocks.position));
}

/**
 * Load all groups for a route, ordered by position.
 */
async function loadRouteGroups(routeId: string) {
  return db
    .select()
    .from(schema.routeGroups)
    .where(eq(schema.routeGroups.route_id, routeId))
    .orderBy(asc(schema.routeGroups.position));
}

/**
 * Show typing indicator for the given delay, then hide it.
 */
async function showTypingDelay(eventCode: string, delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await publishTyping(eventCode, {
    type: "guide_typing",
    participant_name: null,
    participant_id: null,
    is_typing: true,
  });
  await sleep(delayMs);
  await publishTyping(eventCode, {
    type: "guide_typing",
    participant_name: null,
    participant_id: null,
    is_typing: false,
  });
}

/**
 * Send the auto-send blocks (message, image, map) within a group,
 * starting from a given block index. Stops when a question or action block
 * is reached, or all blocks are exhausted.
 *
 * Returns the index of the blocking block (question/action), or -1 if all
 * blocks in the group were sent.
 */
async function sendBlocks(
  eventId: string,
  eventCode: string,
  routeId: string,
  groupId: string,
  stepNumber: number,
  blocks: Awaited<ReturnType<typeof loadGroupBlocks>>,
  startIndex: number,
): Promise<number> {
  const templateVars = await buildRouteTemplateVars(routeId);

  for (let i = startIndex; i < blocks.length; i++) {
    const block = blocks[i];
    const config = block.config as BlockConfig;

    switch (config.type) {
      case "message": {
        await showTypingDelay(eventCode, block.delay_ms);
        const content = applyTemplateVars(config.content, templateVars);
        await writeGuideMessage(eventId, eventCode, stepNumber, content);
        break;
      }

      case "image": {
        await showTypingDelay(eventCode, block.delay_ms);
        await writeGuideMessage(eventId, eventCode, stepNumber, "", config.image_url);
        break;
      }

      case "map": {
        await showTypingDelay(eventCode, block.delay_ms);
        await writeGuideMessage(eventId, eventCode, stepNumber, config.google_maps_link);
        break;
      }

      case "question": {
        // Update event to track current block — pauses for user interaction
        await db
          .update(schema.events)
          .set({
            current_block_id: block.id,
          })
          .where(eq(schema.events.id, eventId));
        return i;
      }

      case "action": {
        // Update event to track current block — pauses for lead confirmation
        await db
          .update(schema.events)
          .set({
            current_block_id: block.id,
          })
          .where(eq(schema.events.id, eventId));

        // Publish action_waiting control event
        await publishControl(eventCode, {
          type: "action_waiting",
          data: { block_id: block.id, label: config.label },
        });
        return i;
      }
    }
  }

  return -1; // All blocks sent
}

/**
 * Run a group from the beginning: load blocks, send auto-send blocks
 * until a question/action block is hit or the group is exhausted.
 *
 * If the group completes without blocking, advances to the next group.
 * If all groups are exhausted, triggers game completion.
 */
export async function runGroup(
  eventId: string,
  eventCode: string,
  groupId: string,
): Promise<void> {
  // Load event to get route_id and step_number
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    columns: {
      route_id: true,
      current_stop: true,
    },
  });

  if (!event) {
    log.error("event not found", { eventId });
    return;
  }

  const blocks = await loadGroupBlocks(groupId);

  if (blocks.length === 0) {
    log.warn("group has no blocks, advancing", { groupId });
    await advanceToNextGroup(eventId, eventCode, event.route_id, groupId);
    return;
  }

  const blockingIndex = await sendBlocks(
    eventId,
    eventCode,
    event.route_id,
    groupId,
    event.current_stop,
    blocks,
    0,
  );

  // If all blocks sent without blocking, advance to next group
  if (blockingIndex === -1) {
    await advanceToNextGroup(eventId, eventCode, event.route_id, groupId);
  }
}

/**
 * Called after a question is answered or an action is confirmed.
 * Continues sending remaining blocks in the current group after the
 * blocking block, then advances to the next group if all blocks are done.
 */
export async function advanceAfterBlock(
  eventId: string,
  eventCode: string,
  blockId: string,
): Promise<void> {
  // Load the block to find its group
  const block = await db.query.routeBlocks.findFirst({
    where: eq(schema.routeBlocks.id, blockId),
  });

  if (!block) {
    log.error("block not found", { blockId });
    return;
  }

  // Load event for route_id and step_number
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    columns: {
      route_id: true,
      current_stop: true,
    },
  });

  if (!event) {
    log.error("event not found", { eventId });
    return;
  }

  // Load all blocks in the group
  const blocks = await loadGroupBlocks(block.group_id);

  // Find the index of the current block
  const currentIndex = blocks.findIndex((b) => b.id === blockId);
  if (currentIndex === -1) {
    log.error("block not found in group", { blockId, groupId: block.group_id });
    return;
  }

  // Continue sending from the block after the current one
  const blockingIndex = await sendBlocks(
    eventId,
    eventCode,
    event.route_id,
    block.group_id,
    event.current_stop,
    blocks,
    currentIndex + 1,
  );

  // If all remaining blocks sent, advance to next group
  if (blockingIndex === -1) {
    await advanceToNextGroup(eventId, eventCode, event.route_id, block.group_id);
  }
}

/**
 * Advance to the next group after the current group is fully processed.
 * If no more groups, triggers game completion.
 */
async function advanceToNextGroup(
  eventId: string,
  eventCode: string,
  routeId: string,
  currentGroupId: string,
): Promise<void> {
  const groups = await loadRouteGroups(routeId);
  const currentIndex = groups.findIndex((g) => g.id === currentGroupId);

  if (currentIndex === -1) {
    log.error("current group not found in route", { routeId, currentGroupId });
    return;
  }

  const nextGroup = groups[currentIndex + 1];

  if (nextGroup) {
    // Update event to point to next group, clear current block
    await db
      .update(schema.events)
      .set({
        current_group_id: nextGroup.id,
        current_block_id: null,
        current_stop: currentIndex + 2, // 1-based step number for messages
      })
      .where(eq(schema.events.id, eventId));

    // Run the next group
    await runGroup(eventId, eventCode, nextGroup.id);
  } else {
    // All groups complete — trigger game completion
    await handleGameCompletion({
      eventId,
      eventCode,
      routeId,
      currentStop: currentIndex + 1, // 1-based
    });
  }
}
