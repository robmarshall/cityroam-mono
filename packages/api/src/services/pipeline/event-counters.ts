/**
 * Per-block counters that two players can race on.
 *
 * `hints_given` and `wrong_attempts` used to be read once when the message
 * was picked up and written back as a computed literal much later — after an
 * LLM round trip and, for hints, after a `sendSequence` that sleeps between
 * items. Two people asking for a hint within a few seconds both read 1 and
 * both wrote 2: hint 1 was served twice and hint 2 was skipped for good.
 *
 * Both increments now happen in a single conditional UPDATE that returns the
 * post-increment value, and the caller acts on what came back. Concurrent
 * requests are serialised by the row lock, so they get consecutive values.
 *
 * The `current_block_id` predicate matters as much as the arithmetic: it
 * means a counter can never be moved for a block the group has already left,
 * so a hint or a "that's not quite right" cannot land seconds after a
 * teammate's correct answer moved everyone on.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

/**
 * Claim the next hint for a block.
 *
 * Increments `hints_given` only while it is still within one of `maxHints` —
 * the extra step is the exhaustion claim, so exactly one caller gets to
 * reveal the answer and advance no matter how many ask at once.
 *
 * Returns the post-increment value: 1..maxHints selects `hints[value - 1]`,
 * `maxHints + 1` means "you are the one revealing the answer", and null means
 * the claim failed because the group has left the block or another request
 * already took the reveal.
 */
export async function claimHint(
  eventId: string,
  blockId: string,
  maxHints: number,
): Promise<number | null> {
  const rows = await db
    .update(schema.events)
    .set({ hints_given: sql`${schema.events.hints_given} + 1` })
    .where(
      and(
        eq(schema.events.id, eventId),
        eq(schema.events.current_block_id, blockId),
        lte(schema.events.hints_given, maxHints),
      ),
    )
    .returning({ hints_given: schema.events.hints_given });

  const value = rows[0]?.hints_given;
  return typeof value === "number" ? value : null;
}

/**
 * Count a wrong answer against the block it was aimed at.
 *
 * Returns the post-increment `wrong_attempts` together with the `hints_given`
 * read in the same statement, so the nudge decision is made on one consistent
 * snapshot. Null means the block moved on under us and nothing was counted —
 * the caller should stay quiet rather than tell a group that has already
 * advanced that they were wrong.
 */
export async function recordWrongAttempt(
  eventId: string,
  blockId: string,
): Promise<{ wrongAttempts: number; hintsGiven: number } | null> {
  const rows = await db
    .update(schema.events)
    .set({ wrong_attempts: sql`${schema.events.wrong_attempts} + 1` })
    .where(
      and(
        eq(schema.events.id, eventId),
        eq(schema.events.current_block_id, blockId),
      ),
    )
    .returning({
      wrong_attempts: schema.events.wrong_attempts,
      hints_given: schema.events.hints_given,
    });

  const row = rows[0];
  if (!row || typeof row.wrong_attempts !== "number") return null;

  return {
    wrongAttempts: row.wrong_attempts,
    hintsGiven: typeof row.hints_given === "number" ? row.hints_given : 0,
  };
}
