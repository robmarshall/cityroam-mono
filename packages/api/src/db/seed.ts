import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { pathToFileURL } from "node:url";
import { messageBanks } from "./schema/message-banks.js";
import {
  ensureDevRouteFamily,
  routesByLanguage,
  seedRoute,
} from "./seed-routes.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://cityroam:cityroam@postgres:5432/cityroam";

export const messageBankSeedData = [
  // Success messages
  { type: "success", content: "That's the one." },
  { type: "success", content: "Correct. I'd be worried if that had taken any longer." },
  { type: "success", content: "Got it." },
  { type: "success", content: "Right first time." },
  { type: "success", content: "There it is." },
  { type: "success", content: "Yep, that's it." },
  { type: "success", content: "Bang on." },

  // Failure messages
  { type: "failure", content: "Not quite." },
  { type: "failure", content: "Nope." },
  { type: "failure", content: "That's not it." },
  { type: "failure", content: "Not the one I'm looking for." },
  { type: "failure", content: "Close, but no." },
  { type: "failure", content: "Have another look." },
  { type: "failure", content: "Wrong. But I believe in you." },

  // Hint-exhausted messages
  { type: "hint-exhausted", content: "That's everything I've got. The answer is {{ANSWER}}. On we go." },
  { type: "hint-exhausted", content: "I've given you all the clues I have. It's {{ANSWER}}. Let's keep moving." },
  { type: "hint-exhausted", content: "Right, I'll put you out of your misery. It's {{ANSWER}}." },

  // Clarification messages
  { type: "clarification", content: "I didn't quite catch that — could you say it differently?" },
  { type: "clarification", content: "Not sure what you mean. Try again?" },
  { type: "clarification", content: "Say that another way and I'll try to help." },

  // Unknown-answer messages
  { type: "unknown-answer", content: "Not sure — that one's outside my knowledge." },
  { type: "unknown-answer", content: "I don't have that one, I'm afraid." },
  { type: "unknown-answer", content: "Can't help you there." },

  // Hint-offer messages
  { type: "hint-offer", content: "Would you like a hint?" },
  { type: "hint-offer", content: "Sounds like you could use a hint — shall I give you one?" },
  { type: "hint-offer", content: "Need a hint? Just say yes." },
  { type: "hint-offer", content: "Want me to give you a hint?" },

  // Hint-decline messages
  { type: "hint-decline", content: "No worries — keep at it." },
  { type: "hint-decline", content: "Fair enough. Take your time." },
  { type: "hint-decline", content: "Alright, you've got this." },
  { type: "hint-decline", content: "Understood. The offer stands if you change your mind." },

  // Over-length messages
  { type: "over-length", content: "That's a bit much. Keep it shorter." },
  { type: "over-length", content: "Too long. Try again with fewer words." },
  { type: "over-length", content: "I stopped reading halfway through. Shorter, please." },

  // Guide-degraded messages — sent when the LLM is unavailable, so the player
  // knows the two things that still work rather than getting a clarification
  // line that would repeat forever
  { type: "guide-degraded", content: "My head's not working right now. Type your answer or ask for a hint and I'll still manage." },
  { type: "guide-degraded", content: "Something's gone wrong at my end. Answers and hints still work — everything else will have to wait." },
  { type: "guide-degraded", content: "I'm not thinking straight at the moment. You can still give me your answer or ask for a hint." },

  // Guide-busy messages — sent when the shared guide rate limit crowds out a
  // conversational reply, so nobody is left with silence
  { type: "guide-busy", content: "One at a time. Give me a moment, then ask again." },
  { type: "guide-busy", content: "You're all talking at once. Ask me again in a second." },
  { type: "guide-busy", content: "Too many at once. Try that again shortly." },

  // Completion templates
  { type: "completion", content: "That's the last one. Well done — you've made it through all {{TOTAL_STOPS}} stops and covered roughly {{DISTANCE_KM}}km of {{CITY_NAME}}.\n\nIf you enjoyed it, a Google review goes a long way: {{REVIEW_LINK}}\n\nNow go find a drink. You've earned it." },
  { type: "completion", content: "And that's a wrap. {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km, and you didn't quit once.\n\nIf you had fun, we'd appreciate a review: {{REVIEW_LINK}}\n\nEnjoy the rest of your day." },
  { type: "completion", content: "Done. All {{TOTAL_STOPS}} stops complete.\n\nYou've covered about {{DISTANCE_KM}}km of {{CITY_NAME}} and hopefully learned a thing or two.\n\nLeave a review if you're feeling generous: {{REVIEW_LINK}}" },
] as const;

async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  try {
    await seedMessageBanks(db);

    // The dev route is seeded with its real content rather than as an empty
    // shell. An active route with no groups is worse than no route at all:
    // checkout can pick it, the buyer pays, and the hunt dies on start with
    // "Route has no groups".
    console.log("\nSeeding development route...");
    const familyId = await ensureDevRouteFamily(db);
    await seedRoute(db, familyId, "en", routesByLanguage.en, false, false);

    console.log("\nSeeding complete.");
  } finally {
    await client.end();
  }
}

/**
 * Inserts only the entries that are missing.
 *
 * Re-running used to duplicate every line in the bank, which quietly skewed
 * the random pick towards whichever message had been inserted most often.
 * Matching on (type, language, content) also means a newly added message
 * reaches a database that was seeded before it existed, without wiping an
 * admin's own edits.
 */
export async function seedMessageBanks(db: ReturnType<typeof drizzle>): Promise<void> {
  console.log("Seeding message banks...");

  const existing = await db
    .select({ type: messageBanks.type, content: messageBanks.content })
    .from(messageBanks)
    .where(eq(messageBanks.language, "en"));

  const seen = new Set(existing.map((e) => `${e.type}\u0000${e.content}`));
  const missing = messageBankSeedData.filter(
    (item) => !seen.has(`${item.type}\u0000${item.content}`),
  );

  if (missing.length === 0) {
    console.log(
      `All ${messageBankSeedData.length} message bank entries already present. Nothing to do.`,
    );
    return;
  }

  await db.insert(messageBanks).values(
    missing.map((item) => ({
      type: item.type,
      language: "en",
      content: item.content,
    })),
  );
  console.log(
    `Inserted ${missing.length} message bank entries (${existing.length} already present).`,
  );
}

// Only run when invoked directly, so a test can import the seeding functions
// without opening a database connection.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
