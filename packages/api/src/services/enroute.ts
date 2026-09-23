/**
 * The en-route phase: the stretch between a solved block and the next one.
 *
 * When a question is answered the runner clears `current_block_id` to claim
 * the advance, then spends the next several minutes delivering the rest of
 * the group — fun facts, a map, walking directions, en-route commentary —
 * each with its own `delay_ms`. For that whole walk the event is parked on no
 * block at all, and every handler that keys off `current_block_id` used to
 * fall straight through to the clarification bank. The guide went deaf
 * exactly when players were most likely to ask "which way at the bridge?".
 *
 * This module records that the walk is in progress, out of band from
 * `current_block_id`, so the handlers can keep their block context without
 * the event ever pointing at a block nobody has been asked about yet.
 *
 * Why not simply point `current_block_id` at the next block? Four things read
 * that column and all of them would break:
 *
 *  - `claimBlockAdvance` compare-and-swaps on it. If it already named the
 *    next question, a correct answer during the walk would claim an advance
 *    while the first sequence was still sending, and two block sequences
 *    would interleave.
 *  - the stranded-group reconciler finds dead runs by `current_block_id IS
 *    NULL`; a non-null value would hide every run that died mid-walk.
 *  - `GET /event/:code` turns a current action block into a pending-action
 *    prompt, so the lead would get a confirm button minutes early.
 *  - the `action_confirm` WS handler accepts a confirm whose block id matches
 *    the column, which would let the lead skip the rest of the sequence.
 *
 * The marker is therefore advisory only. It is set when the advance is
 * claimed, cleared the moment the runner parks on a real block, and carries a
 * TTL sized to the sequence it covers, so losing Redis degrades to today's
 * behaviour rather than wedging a hunt.
 */

import { asc, eq } from "drizzle-orm";
import type { QuestionBlockConfig } from "@cityroam/shared/types";
import { db, schema } from "../db/index.js";
import { redis } from "../redis/client.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("enroute");

/** Shortest sensible marker life — covers a tail of instant blocks. */
const MIN_TTL_MS = 60_000;
/** Upper bound, so a mis-sized tail can't leave a marker for an hour. */
const MAX_TTL_MS = 30 * 60_000;
/** Slack added to the summed delays for LLM calls, writes and clock drift. */
const TTL_MARGIN_MS = 120_000;

/**
 * What the guide knows while the group is walking.
 */
export interface EnRouteState {
  /** Group whose tail is being delivered — the facts and directions. */
  groupId: string;
  /** The block that was just solved or confirmed. */
  fromBlockId: string;
  /** Step number to stamp on messages sent during the walk. */
  stepNumber: number;
}

/**
 * `EnRouteState` plus the question the group is walking towards, resolved
 * from the live event row. Built once per incoming message by the
 * orchestrator and handed to the handlers.
 */
export interface EnRouteContext extends EnRouteState {
  /** The next question block, when the next blocking block is one. */
  nextQuestionBlockId: string | null;
  nextQuestionConfig: QuestionBlockConfig | null;
}

function key(eventId: string): string {
  return `enroute:${eventId}`;
}

/**
 * How long the marker should live, given the delays still to be waited out.
 */
export function enRouteTtlMs(remainingDelaysMs: number): number {
  const raw = remainingDelaysMs + TTL_MARGIN_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, raw));
}

/**
 * Mark the event as walking between blocks.
 *
 * Never throws: the marker only widens what the guide can answer, so a Redis
 * blip must not take down the sequence that was mid-flight when it happened.
 */
export async function setEnRoute(
  eventId: string,
  state: EnRouteState,
  ttlMs: number,
): Promise<void> {
  try {
    await redis.setex(
      key(eventId),
      Math.ceil(ttlMs / 1000),
      JSON.stringify(state),
    );
  } catch (err) {
    log.warn("failed to set en-route marker", {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Read the en-route marker, or null when the event is parked on a block.
 */
export async function getEnRoute(eventId: string): Promise<EnRouteState | null> {
  try {
    const raw = await redis.get(key(eventId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EnRouteState;
    if (!parsed || typeof parsed.groupId !== "string") return null;
    return parsed;
  } catch (err) {
    log.warn("failed to read en-route marker", {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Clear the marker. Called the instant the runner parks on a real block, so
 * the normal block-context path takes over again.
 */
export async function clearEnRoute(eventId: string): Promise<void> {
  try {
    await redis.del(key(eventId));
  } catch (err) {
    log.warn("failed to clear en-route marker", {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Block types that stop the runner and wait for the players. */
function isBlocking(type: string): boolean {
  return type === "question" || type === "action";
}

async function loadBlocks(groupId: string) {
  return db
    .select()
    .from(schema.routeBlocks)
    .where(eq(schema.routeBlocks.group_id, groupId))
    .orderBy(asc(schema.routeBlocks.position));
}

/**
 * What the guide has to work with while the group walks: everything the tail
 * of the solved group says, minus anything about the next clue.
 */
export interface EnRouteTail {
  /** Text of the tail's message blocks, in the order they are sent. */
  notes: string[];
  /** The group's Google Maps link, when it has one. */
  mapLink: string | null;
  /**
   * The message that reads as walking directions: the one immediately after
   * the map card by convention, falling back to the last message in the tail.
   */
  directions: string | null;
}

/**
 * Read the tail of the group that was just solved — the fun facts, map and
 * directions that make up the walk to the next stop.
 *
 * Deliberately scoped to one group: the next group's question block is not in
 * here, so nothing in this context can spoil the clue the players are walking
 * towards.
 */
export async function loadEnRouteTail(
  groupId: string,
  fromBlockId: string,
): Promise<EnRouteTail> {
  const blocks = await loadBlocks(groupId);
  const fromIndex = blocks.findIndex((b) => b.id === fromBlockId);
  const tail = blocks.slice(fromIndex === -1 ? 0 : fromIndex + 1);

  const notes: string[] = [];
  let mapLink: string | null = null;
  let directions: string | null = null;
  let sawMap = false;

  for (const block of tail) {
    const config = block.config as { type?: string; content?: string; google_maps_link?: string };

    if (config.type === "map" && typeof config.google_maps_link === "string") {
      mapLink = config.google_maps_link;
      sawMap = true;
      continue;
    }

    if (config.type === "message" && typeof config.content === "string") {
      notes.push(config.content);
      // The block right after the map card is the walking directions.
      if (sawMap && directions === null) directions = config.content;
    }
  }

  if (directions === null && notes.length > 0) {
    directions = notes[notes.length - 1];
  }

  return { notes, mapLink, directions };
}

/**
 * The question the group is walking towards, resolved from where the runner
 * has actually got to rather than from a value frozen at claim time.
 *
 * Looks for the first blocking block at or after the runner's position in the
 * current group, then at the start of the following group. Returns null when
 * the next thing to stop the group is an action block — an action has no
 * answer to match, and the lead confirms it through its own path.
 */
export async function resolveNextQuestionBlock(
  eventId: string,
): Promise<{ id: string; config: QuestionBlockConfig } | null> {
  const event = await db.query.events.findFirst({
    where: eq(schema.events.id, eventId),
    columns: {
      route_id: true,
      current_group_id: true,
      current_block_index: true,
    },
  });

  if (!event?.current_group_id) return null;

  const blocks = await loadBlocks(event.current_group_id);
  const from = Math.max(0, event.current_block_index);
  let found = blocks.slice(from).find((b) => isBlocking(b.type));

  if (!found) {
    const groups = await db
      .select()
      .from(schema.routeGroups)
      .where(eq(schema.routeGroups.route_id, event.route_id))
      .orderBy(asc(schema.routeGroups.position));

    const idx = groups.findIndex((g) => g.id === event.current_group_id);
    const nextGroup = idx === -1 ? undefined : groups[idx + 1];
    if (!nextGroup) return null;

    const nextBlocks = await loadBlocks(nextGroup.id);
    found = nextBlocks.find((b) => isBlocking(b.type));
  }

  if (!found || found.type !== "question") return null;
  return { id: found.id, config: found.config as QuestionBlockConfig };
}

/**
 * Build the context the handlers use during the walk: the marker plus the
 * question the group is heading for.
 */
export async function buildEnRouteContext(
  eventId: string,
): Promise<EnRouteContext | null> {
  const state = await getEnRoute(eventId);
  if (!state) return null;

  const nextQuestion = await resolveNextQuestionBlock(eventId);

  return {
    ...state,
    nextQuestionBlockId: nextQuestion?.id ?? null,
    nextQuestionConfig: nextQuestion?.config ?? null,
  };
}
