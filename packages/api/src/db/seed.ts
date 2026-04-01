import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { messageBanks } from "./schema/message-banks.js";
import { routes } from "./schema/routes.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://cityroam:cityroam@postgres:5432/cityroam";

const messageBankSeedData = [
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

  // Over-length messages
  { type: "over-length", content: "That's a bit much. Keep it shorter." },
  { type: "over-length", content: "Too long. Try again with fewer words." },
  { type: "over-length", content: "I stopped reading halfway through. Shorter, please." },

  // Opening templates
  { type: "opening", content: "Welcome. I'll be your guide today — I know where we're going, you do the leg work.\n\nHere's how it works: I'll give you a clue at each stop, you figure it out, and we move on. Ask for a hint if you're stuck. Shouldn't take more than 90 minutes if you keep moving.\n\nRight. Head to {{FIRST_STOP_DIRECTIONS}}.\n\nWhen you get there, your first clue:\n\n\"{{FIRST_CLUE}}\"" },
  { type: "opening", content: "Right then, let's get started. I'll be guiding you through {{CITY_NAME}} today.\n\nThe rules are simple: I give clues, you solve them. Ask for hints if you're stuck — no shame in it.\n\nFirst up: {{FIRST_STOP_DIRECTIONS}}.\n\nYour clue:\n\n\"{{FIRST_CLUE}}\"" },
  { type: "opening", content: "Welcome to the game. I'm your guide — dry wit, good directions, no patience for dawdling.\n\nI'll set the clues, you work them out. Hints are available if you get stuck. {{TOTAL_STOPS}} stops, roughly 90 minutes.\n\nTo begin: {{FIRST_STOP_DIRECTIONS}}.\n\nClue:\n\n\"{{FIRST_CLUE}}\"" },

  // Completion templates
  { type: "completion", content: "That's the last one. Well done — you've made it through all {{TOTAL_STOPS}} stops and covered roughly {{DISTANCE_KM}}km of {{CITY_NAME}}.\n\nIf you enjoyed it, a Google review goes a long way: {{REVIEW_LINK}}\n\nNow go find a drink. You've earned it." },
  { type: "completion", content: "And that's a wrap. {{TOTAL_STOPS}} stops, {{DISTANCE_KM}}km, and you didn't quit once.\n\nIf you had fun, we'd appreciate a review: {{REVIEW_LINK}}\n\nEnjoy the rest of your day." },
  { type: "completion", content: "Done. All {{TOTAL_STOPS}} stops complete.\n\nYou've covered about {{DISTANCE_KM}}km of {{CITY_NAME}} and hopefully learned a thing or two.\n\nLeave a review if you're feeling generous: {{REVIEW_LINK}}" },
] as const;

const devRouteData = {
  city: "Leeds",
  name: "Leeds City Centre Discovery",
  description: "A short development route through the heart of Leeds for testing the city exploration experience.",
  total_stops: 3,
  estimated_duration_mins: 30,
  estimated_distance_km: "1.5",
  is_active: true,
};


async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Seeding message banks...");
  await db.insert(messageBanks).values(
    messageBankSeedData.map((item) => ({
      type: item.type,
      content: item.content,
    }))
  );
  console.log(`Inserted ${messageBankSeedData.length} message bank entries.`);

  console.log("Seeding development route...");
  const [route] = await db.insert(routes).values(devRouteData).returning({ id: routes.id });

  console.log(`Inserted route: ${route.id}`);


  console.log("Seeding complete.");
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
